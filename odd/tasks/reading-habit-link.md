# reading-habit-link

The books section's Reading habit is listed inside /habits (one habit, recorded from either surface), and it
stays under Books' ownership: /habits can record it but must not rename or archive it. A settings toggle
controls whether the relation is visible at all, on by default.

## Specs

**S1 — The books Reading habit cannot be renamed or archived from /habits.** User words (verbatim): "el Reading
no se puede ni archivar ni renombrar, bloquea eso". In the habit settings dialog for a books-section habit, the
name input is read-only and the archive control is disabled, with a short explanation. Icon and fields stay
editable. Books' own behaviour is untouched.

**S2 — A settings toggle controls the relation, on by default.** User words (verbatim): "mejor pon una opcion
en la config si quieren esa relacion o no, pero de default dejala prendida". A new preference toggles whether
books-section habits are listed in /habits (active and archived lists). Off restores the pre-link behaviour:
/habits shows only habits-section habits. Books always tracks its reading habit regardless of the toggle.

**S3 — User review gate.** User words (verbatim): "yo reviso al final". Each step lands uncommitted; the user
reviews in the browser.

## Tasks

| ID | Specs | Route | Commit | Task |
| --- | --- | --- | --- | --- |
| T1 | S1, S2 | worker | none | Preference entry + i18n, /habits visibility filter, habit-editor lock, focused tests |
| T2 | S1-S3 | parent | none | Full suite + typecheck + browser pass (toggle on/off, lock, Books still working), then hand to the user |

## Log

L1 (user, verbatim): "el Reading no se puede ni archivar ni renombrar, bloquea eso, mejor pon una opcion en la
config si quieren esa relacion o no, pero de default dejala prendida"

L2 (context, parent): the link itself was delivered in the previous turn — /habits lists every section, so the
books Reading habit appears with its Done/Minutes/Pages fields (web change only, suite 438 green). This feature
adds the ownership rules on top. Books resolves its habit by name against the `modules.readingHabit`
preference inside `section: "books"`, and recreates a fresh "Reading" when its preferred name is missing — the
reason renaming or archiving the linked habit from /habits would silently fork the data.

L3 (decision, parent): the lock is applied in the web UI only, keyed on `habit.section === "books"` (the
ownership marker); no server-side PATCH guard is added in this step. The toggle hides books-section habits from
the /habits lists client-side; Books is unaffected. Server enforcement can be a follow-up if the user wants it.

L4 (evidence, parent, T1 by worker + T2): `modules.readingHabitLinked` registered (workspace toggle, default
true) with en/es labels; /habits filters books-section habits client-side when the preference is explicitly
false, in both the active and archived lists; `HabitEditor` gains `managedByBooks` — read-only name input,
disabled archive button, `habits.managedByBooks` explanation, icon and fields still editable. Suite 58 files /
440 tests green (RED first: missing readonly, missing filter, missing preference key), tsc clean, build green
(23 chunks, 3.2 MB). Browser pass on the dev server: default on lists Reading with its lock verified live
(name readonly, archive disabled, explanation shown, 9 field inputs present); flipping the toggle off through
the real Settings UI hides Reading from /habits while Books keeps its full Reading UI (Done + Minutes, no
`reading_habit_unavailable`); flipping it back on restores the listing. Handed to the user uncommitted for the
S3 review.
