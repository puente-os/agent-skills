---
name: manage-puente-projects
description: Organize the Puente workspace into projects and Kanban tasks with a Puente Studio credential. Use when a Puente Studio user needs to list, create or rename projects, group apps, tables, workflows or agents into a project, or manage a project's task board — create and edit tasks, or move them across backlog, pending, on_going and done. Studio credentials create, edit and organize but never delete; state that deletion happens in the web interface.
---

# Manage Puente Projects

Projects are the folders that group a team's workspace: apps, tables, workflows and agents. Each project also carries a Kanban task board. This skill manages both with the configured Studio credential.

## Read configuration

Use already-exported `BASE_URL` and `STUDIO_KEY` values or read them from the current project's ignored `.env` file. Never read configuration from the installed marketplace or plugin-cache directory. Stop if either value is missing or still contains a placeholder.

Authenticate every request with:

```http
X-API-Key: <STUDIO_KEY>
```

Never print the key, place it in a URL, write it into generated source code, or include it in reports.

## The prefix is `/proyectos`, not `/studio/proyectos`

Every other Studio surface lives under `/studio/`. This one does not. `{BASE_URL}/studio/proyectos` returns 404. Use `{BASE_URL}/proyectos`.

## Load the contract

Read [references/api.md](references/api.md) before any write, and before assigning a component. It carries the payloads, the per-type identifier table, and the error map.

## Choose an operation

- See the whole workspace at once, components and tasks: call `GET /proyectos/all_components`.
- List projects with their component counts: call `GET /proyectos`.
- Create a project: call `POST /proyectos` with `nombre`.
- Rename a project or change its description: call `PUT /proyectos/{proyecto_id}`.
- List a project's tasks: call `GET /proyectos/{proyecto_id}/tareas`.
- Create a task: call `POST /proyectos/{proyecto_id}/tareas`.
- Edit any field of a task: call `PUT /proyectos/{proyecto_id}/tareas/{tarea_id}`.
- Move a task on the board: call `PUT /proyectos/{proyecto_id}/tareas/{tarea_id}/estado`.
- Put components into a project: call `POST /proyectos/{proyecto_id}/componentes`.
- Move a component to another project, or take it out of every project: call `PUT /proyectos/componentes/mover`.
- Delete a project, a task, or an assignment: state that the operation is outside this skill and do nothing. See **Studio never deletes**.

## Studio never deletes

The three DELETE endpoints reject the Studio credential with 401 by design. This is a property of the credential, not a missing feature:

```
DELETE /proyectos/{proyecto_id}                    → 401
DELETE /proyectos/{proyecto_id}/tareas/{tarea_id}  → 401
DELETE /proyectos/{proyecto_id}/componentes        → 401
```

When the user asks to delete a project or a task, say it must be done from the web interface at `https://app.puente.xyz`, and do not attempt the call.

When the user asks to take a component *out* of a project, that is not a deletion and you can do it: call `PUT /proyectos/componentes/mover` with `proyecto_id_destino: null`. The component survives and returns to the virtual `ALL` project. Offer this whenever a delete request turns out to be an unassign request.

## The credential is bound to one team

Omit `equipo_id` everywhere. The key already carries its own, and sending a different one returns `403 Studio API key cannot access the requested team`.

Every project, task and component you touch must belong to that team. Anything else returns 404, including a component that exists but sits in another team.

## Before assigning a component

1. Call `GET /proyectos/all_components` and take the component's `id` from the response. Do not construct it from another source: each type uses a different identifier, and for apps, tables and workflows it is a UUID, not a numeric id. The table in [references/api.md](references/api.md) explains each one.
2. Check whether the component already sits in another project. A component belongs to at most one project, so assigning it **moves** it silently. Warn the user before doing this in bulk.
3. Send the assignment, then read the project back with `GET /proyectos` and confirm the counts changed.

## Before changing a task board

Read the current tasks with `GET /proyectos/{proyecto_id}/tareas` before editing. Task updates are partial: a field you omit keeps its value. The one exception is `tags`, where omitting it or sending `null` keeps the current tags and sending `[]` clears them all.

The four board states are `backlog`, `pending`, `on_going` and `done`, in that flow order. Any other value returns 400.

## Related skills

Assigning components needs identifiers that other skills produce. `GET /proyectos/all_components` already returns all of them, so you rarely need to load another skill just to assign. Load them when the user also wants to create or modify the component itself:

- Apps and tables: `puente-studio`.
- Workflows: `manage-puente-workflows`.
