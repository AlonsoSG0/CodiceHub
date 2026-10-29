import { randomUUID } from "node:crypto";
import type { ChubDatabase } from "../db/client.js";
import { createPreferencesRepository } from "../preferences/repository.js";
import { isTimeZone, todayInZone } from "./timezone.js";

export type RoutineErrorCode = "invalid_body" | "block_not_found" | "block_overlap" | "outside_day_window" | "invalid_time" | "date_frozen";
export class RoutineError extends Error {
  constructor(readonly code: RoutineErrorCode) { super(code); this.name = "RoutineError"; }
}
export type RoutineSnapshot = { settings: Record<string, unknown>; days: unknown[]; blocks: unknown[]; occurrences: unknown[]; mirrors: unknown[] };
export type RoutineLinkTargets = {
  habits: Array<{ id: string; name: string; fieldId: string }>;
  tasks: Array<{ id: string; title: string; projectName: string }>;
  goals: Array<{ id: string; title: string }>;
};
const now = () => new Date().toISOString();
const weekdayOf = (date: string) => new Date(`${date}T12:00:00`).getDay();
const validTime = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const timeMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const localDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const subtractDays = (day: string, days: number) => {
  const [year, month, date] = day.split("-").map(Number);
  const result = new Date(year!, month! - 1, date! - days, 12);
  return localDayKey(result);
};
const workspaceTimeZone = (db: ChubDatabase): string | undefined => {
  const stored = createPreferencesRepository(db).readOne("workspace.timezone");
  if (!stored) return undefined;
  try {
    const value: unknown = JSON.parse(stored.value);
    return isTimeZone(value) ? value : undefined;
  } catch {
    return undefined;
  }
};
const editableFromDay = (db: ChubDatabase, windowDays: number) => {
  const zone = workspaceTimeZone(db);
  const today = zone === undefined ? localDayKey(new Date()) : todayInZone(zone);
  return subtractDays(today, windowDays - 1);
};

export function createRoutineRepository(db: ChubDatabase) {
  const sql = db.$client;
  const snapshot = (): RoutineSnapshot => {
    const setting = sql.prepare("SELECT * FROM routine_settings WHERE id='routine'").get() as any;
    const windows = sql.prepare("SELECT weekday, start, end FROM routine_day_windows ORDER BY weekday").all() as any[];
    return {
      settings: { weekStartsOn: setting.week_starts_on, dayStart: setting.day_start, dayEnd: setting.day_end,
        dayWindows: Object.fromEntries(windows.map((row) => [row.weekday, { start: row.start, end: row.end }])), editWindowDays: setting.edit_window_days },
      days: sql.prepare("SELECT weekday, is_template AS isTemplate FROM routine_days ORDER BY weekday").all(),
      blocks: (sql.prepare("SELECT id, weekday, title, start, end, intent, link_kind AS linkKind, link_id AS linkId, note, position FROM routine_blocks ORDER BY weekday, position, id").all() as any[]).map(({linkKind,linkId,...row})=>({...row, link: linkKind === null ? null : {kind:linkKind,id:linkId}})),
      occurrences: sql.prepare("SELECT block_id AS blockId, date, status, note FROM routine_occurrences ORDER BY date, block_id").all(),
      mirrors: (sql.prepare("SELECT block_id AS blockId, date, target, target_id AS targetId, written, reason FROM routine_mirrors ORDER BY date, block_id").all() as any[]).map((row)=>({...row,written:Boolean(row.written)})),
    };
  };
  const allDayBlocks = (weekday: number) => sql.prepare("SELECT id,start,end FROM routine_blocks WHERE weekday=?").all(weekday) as Array<{id:string;start:string;end:string}>;
  const checkWindow = (weekday: number, start: string, end: string) => {
    const override = sql.prepare("SELECT start,end FROM routine_day_windows WHERE weekday=?").get(weekday) as {start:string;end:string}|undefined;
    const global = sql.prepare("SELECT day_start AS start,day_end AS end FROM routine_settings WHERE id='routine'").get() as {start:string;end:string};
    const window = override ?? global;
    if (timeMinutes(start) < timeMinutes(window.start) || timeMinutes(end) > timeMinutes(window.end)) throw new RoutineError("outside_day_window");
  };
  const validateBlock = (weekday: number, start: string, end: string, ignored?: string) => {
    if (!validTime(start) || !validTime(end) || timeMinutes(start) >= timeMinutes(end)) throw new RoutineError("invalid_time");
    checkWindow(weekday,start,end);
    if (allDayBlocks(weekday).some((row)=>row.id!==ignored && timeMinutes(start)<timeMinutes(row.end) && timeMinutes(end)>timeMinutes(row.start))) throw new RoutineError("block_overlap");
  };
  return {
    snapshot,
    linkTargets(): RoutineLinkTargets {
      return {
        habits: sql.prepare(`
          SELECT h.id, h.name, (
            SELECT f.id FROM habit_fields f
            WHERE f.habit_id = h.id AND f.archived_at IS NULL AND f.kind IN ('check', 'number')
            ORDER BY CASE WHEN f.kind = 'check' THEN 0 ELSE 1 END, f.position, f.id
            LIMIT 1
          ) AS fieldId
          FROM habits h
          WHERE h.archived_at IS NULL AND EXISTS (
            SELECT 1 FROM habit_fields f
            WHERE f.habit_id = h.id AND f.archived_at IS NULL AND f.kind IN ('check', 'number')
          )
          ORDER BY h.position, h.id
        `).all() as RoutineLinkTargets["habits"],
        tasks: sql.prepare(`
          SELECT t.id, t.title, p.name AS projectName
          FROM tasks t
          JOIN project_columns c ON c.id = t.column_id
          JOIN projects p ON p.id = t.project_id
          WHERE c.is_completed = 0
          ORDER BY p.name, t.position, t.id
        `).all() as RoutineLinkTargets["tasks"],
        goals: sql.prepare("SELECT id, title FROM goals ORDER BY position, id").all() as RoutineLinkTargets["goals"],
      };
    },
    updateSettings(input: any) {
      const txn=sql.transaction(()=>{
        const current=sql.prepare("SELECT * FROM routine_settings WHERE id='routine'").get() as any;
        const start=input.dayStart ?? current.day_start, end=input.dayEnd ?? current.day_end;
        if (!validTime(start)||!validTime(end)||timeMinutes(start)>=timeMinutes(end)) throw new RoutineError("invalid_time");
        const week=input.weekStartsOn ?? current.week_starts_on;
        const editWindowDays=input.editWindowDays===undefined?current.edit_window_days:input.editWindowDays;
        if (!Number.isInteger(week)||week<0||week>6||![3,7].includes(editWindowDays)) throw new RoutineError("invalid_body");
        sql.prepare("UPDATE routine_settings SET week_starts_on=?,day_start=?,day_end=?,edit_window_days=?,updated_at=? WHERE id='routine'").run(week,start,end,editWindowDays,now());
        if(input.dayWindows!==undefined){if(!Array.isArray(input.dayWindows)) throw new RoutineError("invalid_body"); for(const win of input.dayWindows){if(!win||!Number.isInteger(win.weekday)||win.weekday<0||win.weekday>6) throw new RoutineError("invalid_body"); if(win.start===null){sql.prepare("DELETE FROM routine_day_windows WHERE weekday=?").run(win.weekday);continue;} if(!validTime(win.start)||!validTime(win.end)||timeMinutes(win.start)>=timeMinutes(win.end))throw new RoutineError("invalid_time"); sql.prepare("INSERT INTO routine_day_windows VALUES(?,?,?) ON CONFLICT(weekday) DO UPDATE SET start=excluded.start,end=excluded.end").run(win.weekday,win.start,win.end);}}
        for(let day=0;day<7;day++) for(const block of allDayBlocks(day)) validateBlock(day,block.start,block.end,block.id);
      }); txn.immediate(); return snapshot();
    },
    createBlock(weekday:number,input:any){if(!Number.isInteger(weekday)||weekday<0||weekday>6)throw new RoutineError("invalid_body"); validateBlock(weekday,input.start,input.end); const ts=now(); sql.prepare("INSERT INTO routine_blocks(id,weekday,title,start,end,intent,link_kind,link_id,note,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(),weekday,input.title??"",input.start,input.end,input.intent??"must",input.link?.kind??null,input.link?.id??null,input.note??"",allDayBlocks(weekday).length,ts,ts);return snapshot();},
    updateBlock(id:string,input:any){const row=sql.prepare("SELECT * FROM routine_blocks WHERE id=?").get(id) as any;if(!row)throw new RoutineError("block_not_found");const start=input.start??row.start,end=input.end??row.end;validateBlock(row.weekday,start,end,id);sql.prepare("UPDATE routine_blocks SET title=?,start=?,end=?,intent=?,link_kind=?,link_id=?,note=?,updated_at=? WHERE id=?").run(input.title??row.title,start,end,input.intent??row.intent,input.link===undefined?row.link_kind:input.link?.kind??null,input.link===undefined?row.link_id:input.link?.id??null,input.note??row.note,now(),id);return snapshot();},
    deleteBlock(id:string){if(!sql.prepare("SELECT 1 FROM routine_blocks WHERE id=?").get(id))throw new RoutineError("block_not_found");sql.prepare("DELETE FROM routine_blocks WHERE id=?").run(id);return snapshot();},
    repeat(weekday:number){if(!Number.isInteger(weekday)||weekday<0||weekday>6)throw new RoutineError("invalid_body");const tx=sql.transaction(()=>{const source=allDayBlocks(weekday);const full=sql.prepare("SELECT * FROM routine_blocks WHERE weekday=? ORDER BY position").all(weekday) as any[];for(let day=0;day<7;day++){if(day===weekday)continue;sql.prepare("DELETE FROM routine_blocks WHERE weekday=?").run(day);full.forEach((block,position)=>sql.prepare("INSERT INTO routine_blocks(id,weekday,title,start,end,intent,link_kind,link_id,note,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(),day,block.title,block.start,block.end,block.intent,block.link_kind,block.link_id,block.note,position,now(),now()));}sql.prepare("UPDATE routine_days SET is_template=(weekday=?)").run(weekday);});tx.immediate();return snapshot();},
    clearDay(weekday:number){sql.prepare("DELETE FROM routine_blocks WHERE weekday=?").run(weekday);return snapshot();},
    setOccurrence(id:string,date:string,input:any){const occurrence=sql.transaction(()=>{const block=sql.prepare("SELECT * FROM routine_blocks WHERE id=?").get(id) as any;if(!block)throw new RoutineError("block_not_found");if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||weekdayOf(date)!==block.weekday)throw new RoutineError("invalid_body");const settings=sql.prepare("SELECT edit_window_days FROM routine_settings WHERE id='routine'").get() as {edit_window_days:number};if(date<editableFromDay(db,settings.edit_window_days))throw new RoutineError("date_frozen");const status=input.status??"done";if(!["pending","done","missed","excused","skipped"].includes(status)|| (input.note!==undefined&&typeof input.note!=="string"))throw new RoutineError("invalid_body");const ts=now();sql.prepare("INSERT INTO routine_occurrences VALUES(?,?,?,?,?,?) ON CONFLICT(block_id,date) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at").run(id,date,status,input.note??"",ts,ts);return {block,status,ts};});
      const {block,status,ts}=occurrence.immediate();
      if(!block.link_kind)return snapshot();
      const writeMirror=sql.transaction(()=>{let written=false,reason:string|null=null;
        if(block.link_kind==="habit") {const habit=sql.prepare("SELECT h.id,f.id AS field_id FROM habits h JOIN habit_fields f ON f.habit_id=h.id WHERE h.id=? AND h.archived_at IS NULL AND f.archived_at IS NULL ORDER BY f.position LIMIT 1").get(block.link_id) as any;
          if(habit){if(status==="done")sql.prepare("INSERT INTO habit_entries(habit_id,field_id,date,value_num,value_text,created_at,updated_at) VALUES(?,?,?,1,NULL,?,?) ON CONFLICT(habit_id,field_id,date) DO UPDATE SET value_num=1,value_text=NULL,updated_at=excluded.updated_at").run(habit.id,habit.field_id,date,ts,ts);else sql.prepare("DELETE FROM habit_entries WHERE habit_id=? AND field_id=? AND date=?").run(habit.id,habit.field_id,date);written=true;}else reason="target_missing";
        } else if(block.link_kind==="task") {const task=sql.prepare("SELECT t.id,t.project_id,t.column_id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.archived_at IS NULL").get(block.link_id) as any;if(!task)reason="target_missing";else{const current=sql.prepare("SELECT is_completed FROM project_columns WHERE id=?").get(task.column_id) as any;const completed=status==="done";if(completed&& !current?.is_completed){const column=sql.prepare("SELECT id FROM project_columns WHERE project_id=? AND is_completed=1 ORDER BY position LIMIT 1").get(task.project_id) as any;if(!column){reason="no_completed_column";}else{sql.prepare("UPDATE tasks SET column_id=?,updated_at=? WHERE id=?").run(column.id,ts,task.id);written=true;}} else if(!completed&&current?.is_completed){const first=sql.prepare("SELECT id FROM project_columns WHERE project_id=? AND is_completed=0 ORDER BY position LIMIT 1").get(task.project_id) as any;if(first)sql.prepare("UPDATE tasks SET column_id=?,updated_at=? WHERE id=?").run(first.id,ts,task.id);written=true;}else{written=true;}}}
        sql.prepare("INSERT INTO routine_mirrors VALUES(?,?,?,?,?,?) ON CONFLICT(block_id,date) DO UPDATE SET target=excluded.target,target_id=excluded.target_id,written=excluded.written,reason=excluded.reason").run(id,date,block.link_kind,block.link_id,written?1:0,reason);
      });
      try{writeMirror.immediate();}catch{try{sql.prepare("INSERT INTO routine_mirrors VALUES(?,?,?,?,?,?) ON CONFLICT(block_id,date) DO UPDATE SET target=excluded.target,target_id=excluded.target_id,written=0,reason=excluded.reason").run(id,date,block.link_kind,block.link_id,0,"mirror_failed");}catch{/* The occurrence is already committed; mirror failures must never fail the request. */}}
      return snapshot();},
  };
}
