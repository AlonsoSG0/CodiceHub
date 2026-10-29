import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type ChubDatabase } from "../src/db/client.js";
import { createRoutineRepository } from "../src/routine/repository.js";
import { todayInZone as serverTodayInZone } from "../src/routine/timezone.js";
import { app } from "../src/app.js";

describe("routine persistence and HTTP API", () => {
  let db: ChubDatabase;
  const call=(path:string,method="GET",body?:unknown)=>app.request(path,{method,headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})},{db});
  const localDayKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const daysAgo=(days:number)=>{const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()-days);return localDayKey(date);};
  const weekdayOf=(date:string)=>{const [year,month,day]=date.split("-").map(Number);return new Date(year,month-1,day,12).getDay();};
  const recentDayForWeekday=(weekday:number)=>{const date=new Date();date.setHours(12,0,0,0);for(let offset=0;offset<7;offset++){if(date.getDay()===weekday)return localDayKey(date);date.setDate(date.getDate()-1);}throw new Error("No date found in the edit window");};
  beforeEach(()=>{db=createDb(join(mkdtempSync(join(tmpdir(),"chub-routine-")),"chub.db"));});
  afterEach(()=>{vi.useRealTimers();db.$client.close();});

  it("returns active habits with their check field, excluding archived and untrackable habits", async () => {
    const stamp = new Date().toISOString();
    const addHabit = db.$client.prepare("INSERT INTO habits(id,name,position,created_at,updated_at,archived_at) VALUES(?,?,?,?,?,?)");
    addHabit.run("active", "Active habit", 0, stamp, stamp, null);
    addHabit.run("archived", "Archived habit", 1, stamp, stamp, stamp);
    addHabit.run("untrackable", "Untrackable habit", 2, stamp, stamp, null);
    const addField = db.$client.prepare("INSERT INTO habit_fields(id,habit_id,kind,label,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?)");
    addField.run("active-number", "active", "number", "Minutes", 0, stamp, stamp);
    addField.run("active-check", "active", "check", "Done", 1, stamp, stamp);
    addField.run("archived-check", "archived", "check", "Done", 0, stamp, stamp);
    addField.run("untrackable-text", "untrackable", "text", "Note", 0, stamp, stamp);

    const response = await call("/api/routine/link-targets");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      habits: [{ id: "active", name: "Active habit", fieldId: "active-check" }],
      tasks: [],
      goals: [],
    });
  });

  it("returns incomplete tasks with their project name and excludes completed tasks", async () => {
    const stamp = new Date().toISOString();
    db.$client.prepare("INSERT INTO projects(id,name,created_at,updated_at) VALUES(?,?,?,?)").run("p", "Project name", stamp, stamp);
    const addColumn = db.$client.prepare("INSERT INTO project_columns(id,project_id,name,position,is_completed,created_at,updated_at) VALUES(?,?,?,?,?,?,?)");
    addColumn.run("todo", "p", "Todo", 0, 0, stamp, stamp);
    addColumn.run("done", "p", "Done", 1, 1, stamp, stamp);
    const addTask = db.$client.prepare("INSERT INTO tasks(id,project_id,column_id,title,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?)");
    addTask.run("active", "p", "todo", "Active task", 0, stamp, stamp);
    addTask.run("completed", "p", "done", "Completed task", 1, stamp, stamp);

    const response = await call("/api/routine/link-targets");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      habits: [],
      tasks: [{ id: "active", title: "Active task", projectName: "Project name" }],
      goals: [],
    });
  });

  it("round-trips the edit window setting and rejects values other than 3 or 7",async()=>{
    const initial=await call("/api/routine");
    expect((await initial.json() as any).settings.editWindowDays).toBe(7);

    const response=await call("/api/routine/settings","PUT",{editWindowDays:3});
    expect(response.status).toBe(200);
    expect((await response.json() as any).settings.editWindowDays).toBe(3);

    const invalid=await call("/api/routine/settings","PUT",{editWindowDays:4});
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toBe('{"error":"invalid_body"}');
    expect((await (await call("/api/routine")).json() as any).settings.editWindowDays).toBe(3);
  });

  it("computes the same day key as the web helper for zones across UTC offsets", () => {
    const now = new Date("2026-01-01T12:30:00.000Z");
    const zones = ["America/Los_Angeles", "America/Mexico_City", "UTC", "Pacific/Kiritimati"];
    const webTodayInZone = (zone: string, instant: Date) => {
      const parts = new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
      const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
      return `${value("year")}-${value("month")}-${value("day")}`;
    };
    for (const zone of zones) expect(serverTodayInZone(zone, now)).toBe(webTodayInZone(zone, now));
    expect(serverTodayInZone("Pacific/Kiritimati", new Date("2026-01-01T12:30:00.000Z"))).toBe("2026-01-02");
  });

  it("freezes by the workspace day when the server-local day would allow the write", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T23:00:00.000Z"));
    db.$client.prepare("INSERT INTO preferences(key,value,updated_at) VALUES(?,?,?)").run("workspace.timezone", JSON.stringify("Pacific/Kiritimati"), "now");
    await call("/api/routine/settings", "PUT", { editWindowDays: 3 });
    const date = "2025-12-30";
    const repo = createRoutineRepository(db);
    const block = (repo.createBlock(weekdayOf(date), { title: "Workspace-frozen date", start: "08:00", end: "09:00" }).blocks as any[])[0];

    const response = await call(`/api/routine/blocks/${block.id}/occurrences/${date}`, "PUT", { status: "done" });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"error":"date_frozen"}');
    expect(db.$client.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE block_id=? AND date=?").get(block.id, date)).toEqual({ count: 0 });
    expect(db.$client.prepare("SELECT COUNT(*) AS count FROM routine_mirrors WHERE block_id=? AND date=?").get(block.id, date)).toEqual({ count: 0 });
  });

  it("allows by the workspace day when the server-local day would freeze the write", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T01:00:00.000Z"));
    db.$client.prepare("INSERT INTO preferences(key,value,updated_at) VALUES(?,?,?)").run("workspace.timezone", JSON.stringify("America/Los_Angeles"), "now");
    await call("/api/routine/settings", "PUT", { editWindowDays: 3 });
    const date = "2025-12-29";
    const repo = createRoutineRepository(db);
    const block = (repo.createBlock(weekdayOf(date), { title: "Workspace-editable date", start: "08:00", end: "09:00" }).blocks as any[])[0];

    const response = await call(`/api/routine/blocks/${block.id}/occurrences/${date}`, "PUT", { status: "done" });

    expect(response.status).toBe(200);
    expect((await response.json() as any).occurrences).toContainEqual(expect.objectContaining({ blockId: block.id, date, status: "done" }));
    expect(db.$client.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE block_id=? AND date=?").get(block.id, date)).toEqual({ count: 1 });
  });

  it("allows occurrence writes inside the edit window and on its last editable day",async()=>{
    await call("/api/routine/settings","PUT",{editWindowDays:3});
    for(const date of [daysAgo(1),daysAgo(2)]){
      const repo=createRoutineRepository(db);
      const block=(repo.createBlock(weekdayOf(date),{title:"Open date",start:"08:00",end:"09:00"}).blocks as any[]).find((entry)=>entry.title==="Open date");
      const response=await call(`/api/routine/blocks/${block.id}/occurrences/${date}`,"PUT",{status:"done"});
      expect(response.status).toBe(200);
      expect((await response.json() as any).occurrences).toContainEqual(expect.objectContaining({blockId:block.id,date,status:"done"}));
    }
  });

  it("refuses a date one day older than the edit window without writing an occurrence or mirror",async()=>{
    await call("/api/routine/settings","PUT",{editWindowDays:3});
    const date=daysAgo(3);
    const repo=createRoutineRepository(db);
    const block=(repo.createBlock(weekdayOf(date),{title:"Frozen date",start:"08:00",end:"09:00"}).blocks as any[]).find((entry)=>entry.title==="Frozen date");
    const response=await call(`/api/routine/blocks/${block.id}/occurrences/${date}`,"PUT",{status:"done"});
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"error":"date_frozen"}');
    expect(db.$client.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE block_id=? AND date=?").get(block.id,date)).toEqual({count:0});
    expect(db.$client.prepare("SELECT COUNT(*) AS count FROM routine_mirrors WHERE block_id=? AND date=?").get(block.id,date)).toEqual({count:0});
  });

  it("round-trips settings and per-weekday windows through the app",async()=>{
    const response=await call("/api/routine/settings","PUT",{weekStartsOn:0,dayStart:"06:00",dayEnd:"22:00",dayWindows:[{weekday:2,start:"08:00",end:"20:00"}]});
    expect(response.status).toBe(200);
    const body=await response.json() as any;
    expect(body.settings).toEqual({weekStartsOn:0,dayStart:"06:00",dayEnd:"22:00",dayWindows:{2:{start:"08:00",end:"20:00"}},editWindowDays:7});
    expect(body.days).toHaveLength(7);
  });

  it("refuses overlapping blocks without writing",()=>{
    const repo=createRoutineRepository(db);
    repo.createBlock(1,{title:"First",start:"08:00",end:"09:00"});
    expect(()=>repo.createBlock(1,{title:"Overlap",start:"08:30",end:"09:30"})).toThrowError(expect.objectContaining({code:"block_overlap"}));
    expect((repo.snapshot().blocks as unknown[])).toHaveLength(1);
  });

  it("repeats a template day onto the other six days",()=>{
    const repo=createRoutineRepository(db);
    repo.createBlock(1,{title:"Read",start:"08:00",end:"09:00"});
    const result=repo.repeat(1);
    expect(result.days).toEqual(expect.arrayContaining([{weekday:1,isTemplate:1}]));
    expect(result.blocks).toHaveLength(7);
  });

  it("keeps the routine occurrence when a database error prevents the habit mirror",async()=>{
    const stamp=new Date().toISOString();
    db.$client.prepare("INSERT INTO habits(id,name,position,created_at,updated_at) VALUES(?,?,?,?,?)").run("h","Habit",0,stamp,stamp);
    db.$client.prepare("INSERT INTO habit_fields(id,habit_id,kind,label,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("f","h","boolean","Done",0,stamp,stamp);
    db.$client.exec("CREATE TRIGGER reject_habit_entry BEFORE INSERT ON habit_entries BEGIN SELECT RAISE(ABORT, 'mirror insert rejected'); END");
    const repo=createRoutineRepository(db);
    const block=(repo.createBlock(1,{title:"Habit",start:"08:00",end:"09:00",link:{kind:"habit",id:"h"}}).blocks as any[])[0];
    const date=recentDayForWeekday(1);
    const response=await call(`/api/routine/blocks/${block.id}/occurrences/${date}`,"PUT",{status:"done"});
    expect(response.status).toBe(200);
    const body=await response.json() as any;
    expect(body.occurrences).toContainEqual(expect.objectContaining({blockId:block.id,date,status:"done"}));
    expect(body.mirrors).toContainEqual(expect.objectContaining({blockId:block.id,date,written:false,reason:"mirror_failed"}));
  });

  it("keeps routine occurrence when the linked habit no longer exists",async()=>{
    const repo=createRoutineRepository(db);
    const block=(repo.createBlock(1,{title:"Read",start:"08:00",end:"09:00",link:{kind:"habit",id:"deleted"}}).blocks as any[])[0];
    const date=recentDayForWeekday(1);
    const response=await call(`/api/routine/blocks/${block.id}/occurrences/${date}`,"PUT",{status:"done"});
    expect(response.status).toBe(200);
    const body=await response.json() as any;
    expect(body.occurrences).toContainEqual(expect.objectContaining({blockId:block.id,date,status:"done"}));
    expect(body.mirrors).toContainEqual(expect.objectContaining({blockId:block.id,written:false,reason:"target_missing"}));
  });

  it("keeps the routine occurrence when a linked task project has no completed column",async()=>{
    const stamp=new Date().toISOString();
    db.$client.prepare("INSERT INTO projects(id,name,created_at,updated_at) VALUES(?,?,?,?)").run("p","Project",stamp,stamp);
    db.$client.prepare("INSERT INTO project_columns(id,project_id,name,position,is_completed,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("todo","p","Todo",0,0,stamp,stamp);
    db.$client.prepare("INSERT INTO tasks(id,project_id,column_id,title,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("t","p","todo","Task",0,stamp,stamp);
    const repo=createRoutineRepository(db);
    const block=(repo.createBlock(1,{title:"Task",start:"08:00",end:"09:00",link:{kind:"task",id:"t"}}).blocks as any[])[0];
    const date=recentDayForWeekday(1);
    const response=await call(`/api/routine/blocks/${block.id}/occurrences/${date}`,"PUT",{status:"done"});
    expect(response.status).toBe(200);
    const body=await response.json() as any;
    expect(body.occurrences).toContainEqual(expect.objectContaining({blockId:block.id,date,status:"done"}));
    expect((db.$client.prepare("SELECT column_id FROM tasks WHERE id='t'").get() as any).column_id).toBe("todo");
    expect(body.mirrors).toContainEqual(expect.objectContaining({blockId:block.id,written:false,reason:"no_completed_column"}));
  });

  it("keeps the routine occurrence when the linked task target is missing",async()=>{
    const repo=createRoutineRepository(db);
    const block=(repo.createBlock(1,{title:"Task",start:"08:00",end:"09:00",link:{kind:"task",id:"deleted"}}).blocks as any[])[0];
    const date=recentDayForWeekday(1);
    const response=await call(`/api/routine/blocks/${block.id}/occurrences/${date}`,"PUT",{status:"done"});
    expect(response.status).toBe(200);
    const body=await response.json() as any;
    expect(body.occurrences).toContainEqual(expect.objectContaining({blockId:block.id,date,status:"done"}));
    expect(body.mirrors).toContainEqual(expect.objectContaining({blockId:block.id,written:false,reason:"target_missing"}));
  });

  it("moves a linked task to its completed column idempotently",async()=>{
    const stamp=new Date().toISOString();
    db.$client.prepare("INSERT INTO projects(id,name,created_at,updated_at) VALUES(?,?,?,?)").run("p","Project",stamp,stamp);
    const addColumn=db.$client.prepare("INSERT INTO project_columns(id,project_id,name,position,is_completed,created_at,updated_at) VALUES(?,?,?,?,?,?,?)");
    addColumn.run("todo","p","Todo",0,0,stamp,stamp);
    addColumn.run("done","p","Done",1,1,stamp,stamp);
    db.$client.prepare("INSERT INTO tasks(id,project_id,column_id,title,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("t","p","todo","Task",0,stamp,stamp);
    const repo=createRoutineRepository(db);
    const block=(repo.createBlock(1,{title:"Task",start:"08:00",end:"09:00",link:{kind:"task",id:"t"}}).blocks as any[])[0];
    const date=recentDayForWeekday(1);
    const path=`/api/routine/blocks/${block.id}/occurrences/${date}`;
    expect((await call(path,"PUT",{status:"done"})).status).toBe(200);
    expect((db.$client.prepare("SELECT column_id FROM tasks WHERE id='t'").get() as any).column_id).toBe("done");
    expect((await call(path,"PUT",{status:"done"})).status).toBe(200);
    expect((db.$client.prepare("SELECT column_id FROM tasks WHERE id='t'").get() as any).column_id).toBe("done");
  });
});
