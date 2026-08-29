# Projects and tasks — API contract

Every path below is relative to `BASE_URL`, with no `/studio` prefix. Authenticate with `X-API-Key: <STUDIO_KEY>`.

## Endpoint map

| Action | Method | Path |
|---|---|---|
| Workspace overview | GET | `/proyectos/all_components` |
| List projects | GET | `/proyectos` |
| Create project | POST | `/proyectos` |
| Update project | PUT | `/proyectos/{proyecto_id}` |
| List tasks | GET | `/proyectos/{proyecto_id}/tareas` |
| Create task | POST | `/proyectos/{proyecto_id}/tareas` |
| Update task | PUT | `/proyectos/{proyecto_id}/tareas/{tarea_id}` |
| Move task on the board | PUT | `/proyectos/{proyecto_id}/tareas/{tarea_id}/estado` |
| Assign components | POST | `/proyectos/{proyecto_id}/componentes` |
| Move or unassign a component | PUT | `/proyectos/componentes/mover` |
| Delete project / task / assignment | DELETE | **Rejected with 401. Web interface only.** |

---

## Component identifiers

The single most common mistake. Each type is identified differently, and three of the four are UUIDs rather than numeric ids. Always take the value from the `id` field that `GET /proyectos/all_components` returns for that component.

| `tipo` | What goes in `componente_id` | Shape | Example |
|---|---|---|---|
| `app` | the artifact's **group** id, stable across versions | UUID string | `"3600f621-e90b-49d3-89dc-f5d1b79b9156"` |
| `workflow` | the workflow's **group** id, stable across versions | UUID string | `"f636b7f0-d6a2-46a0-8669-9f995a083002"` |
| `tabla` | the table id | UUID string | `"dc32d317-a1c2-432e-9c95-0a53e24d2b9d"` |
| `agente` | the agent id | numeric, as a string | `"77"` |

For `app` the API also accepts the numeric version id and normalizes it to the group id. Do not rely on that: the numeric id changes with every push, the group id never does.

`tipo` accepts exactly `app`, `workflow`, `tabla`, `agente`. Note the singular Spanish `agente` in requests, while responses group them under the English key `agents`.

---

## Workspace overview

```http
GET /proyectos/all_components
GET /proyectos/all_components?proyecto_id=7
```

Omit `proyecto_id`, or pass `ALL`, for the entire workspace. Pass a project id to get only that project's components and tasks.

**The response is an array with one element.** Read `response[0]`, not `response`.

```jsonc
[
  {
    "id": "ALL",
    "titulo": "Todos",
    "descripcion": "Todos los componentes disponibles en el workspace",
    "fecha_creacion": "2026-08-29T00:14:48.127471+00:00",
    "tareas": [],
    "componentes": {
      "apps":      [ { "id": "3600f621-…", "titulo": "Mi App",  "descripcion": null, "fecha_creacion": "…" } ],
      "workflows": [ { "id": "f636b7f0-…", "titulo": "Flujo",   "descripcion": null, "fecha_creacion": "…" } ],
      "tablas":    [ { "id": "dc32d317-…", "titulo": "ventas",  "descripcion": null, "fecha_creacion": "…" } ],
      "agents":    [ { "id": "77",         "titulo": "Agente",  "descripcion": null, "fecha_creacion": "…" } ]
    }
  }
]
```

This is the cheapest way to resolve every component identifier at once.

---

## Projects

### List

```http
GET /proyectos
```

```jsonc
[
  {
    "id": "ALL",                    // virtual, always first
    "titulo": "Todos",
    "descripcion": "Todos los componentes disponibles en el workspace",
    "created_at": null,
    "updated_at": null,
    "componentes": { "apps": 111, "workflows": 87, "tablas": 42, "agents": 8 }
  },
  {
    "id": "12",                     // real project — numeric id, as a string
    "titulo": "Lanzamiento Q3",
    "descripcion": "Todo lo del release",
    "created_at": "2026-07-14T17:07:29.920104+00:00",
    "updated_at": "2026-07-14T17:07:29.920104+00:00",
    "componentes": { "apps": 0, "workflows": 2, "tablas": 0, "agents": 0 }
  }
]
```

`componentes` here holds **counts**, not lists. The counts exclude orphans: a component deleted from its source table stops being counted even if the assignment row survives.

**The `ALL` project is virtual.** It does not exist in the database — it represents everything not assigned to a real project. Its `id` is the literal string `"ALL"`, and it cannot be renamed, deleted, or given tasks or components. `PUT /proyectos/ALL` fails validation because the path expects an integer.

Real project ids come back as **strings** here (`"12"`) but every path parameter takes the integer.

### Create

```http
POST /proyectos
Content-Type: application/json

{ "nombre": "Lanzamiento Q3", "descripcion": "Todo lo del release" }
```

`descripcion` is optional. Omit `equipo_id`: the Studio key supplies it, and any other value returns 403. Leading and trailing whitespace in `nombre` is trimmed.

Returns 201 with the created project. Save the `id`.

### Update

```http
PUT /proyectos/{proyecto_id}
Content-Type: application/json

{ "nombre": "Nuevo nombre" }
```

Partial: send only the fields to change. Sending neither `nombre` nor `descripcion` returns `400 Debes enviar al menos un campo para actualizar`.

---

## Tasks

The board has four states, in flow order:

```
backlog → pending → on_going → done
```

Any other value returns 400 with the valid list. Task listings come back ordered by that flow and then by creation date.

### List

```http
GET /proyectos/{proyecto_id}/tareas
GET /proyectos/{proyecto_id}/tareas?estado=on_going
```

```jsonc
[
  {
    "id": 2,                        // numeric, unlike the project id
    "proyecto_id": 3,
    "nombre": "Revisar el copy del landing",
    "descripcion": "Pasada final antes del release",
    "estado": "on_going",
    "fecha_entrega": null,          // "YYYY-MM-DD" when set
    "tags": [],
    "created_at": "2026-05-27T17:05:59.891228+00:00",
    "updated_at": "2026-05-27T17:13:18.504403+00:00"
  }
]
```

### Create

```http
POST /proyectos/{proyecto_id}/tareas
Content-Type: application/json

{
  "nombre": "Revisar el copy del landing",
  "descripcion": "Pasada final antes del release",
  "estado": "backlog",
  "fecha_entrega": "2026-09-15",
  "tags": ["urgente", "marketing"]
}
```

Only `nombre` is required. `estado` defaults to `backlog`, `fecha_entrega` to null, `tags` to `[]`. Dates are `YYYY-MM-DD`. Returns 201.

### Update

```http
PUT /proyectos/{proyecto_id}/tareas/{tarea_id}
Content-Type: application/json

{ "estado": "on_going", "fecha_entrega": "2026-09-20" }
```

Partial: an omitted field keeps its value. **`tags` behaves differently from the rest** — omitting it or sending `null` keeps the current tags, and sending `[]` clears them all. There is no way to clear `descripcion` or `fecha_entrega` back to null through this endpoint.

Sending none of `nombre`, `descripcion`, `estado` or `fecha_entrega` returns 400.

### Move on the board

```http
PUT /proyectos/{proyecto_id}/tareas/{tarea_id}/estado
Content-Type: application/json

{ "estado": "done" }
```

The drag-and-drop shortcut. Same effect as the update above with only `estado`, but it is the endpoint the board uses. Prefer it when the state is the only thing changing.

**Its response always reports `tags: []`, even when the task has tags.** The stored tags are not touched — only this endpoint's response omits them. Do not feed that response back into an update, and do not tell the user their tags were cleared. Re-read with `GET /proyectos/{proyecto_id}/tareas` if you need the real tags.

---

## Components in a project

### Assign

```http
POST /proyectos/{proyecto_id}/componentes
Content-Type: application/json

[
  { "tipo": "app",      "componente_id": "3600f621-e90b-49d3-89dc-f5d1b79b9156" },
  { "tipo": "tabla",    "componente_id": "dc32d317-a1c2-432e-9c95-0a53e24d2b9d" },
  { "tipo": "workflow", "componente_id": "f636b7f0-d6a2-46a0-8669-9f995a083002" },
  { "tipo": "agente",   "componente_id": "77" }
]
```

The body is an array; an empty one returns 400. Response: `{"asignados": 4, "proyecto_id": 7}`.

**A component belongs to at most one project.** Assigning one that already sits elsewhere **moves** it, silently and with no warning in the response. Check `GET /proyectos/all_components?proyecto_id=…` first when it matters, and tell the user before doing it in bulk.

Every component must belong to the key's team. One that does not returns `404 El componente {tipo}/{id} no existe en tu equipo`, and the whole call stops there — components earlier in the array have already been assigned. Validate the list before sending.

### Move or unassign

```http
PUT /proyectos/componentes/mover
Content-Type: application/json

{ "tipo": "app", "componente_id": "3600f621-…", "proyecto_id_destino": 7 }
```

Note the path: `/proyectos/componentes/mover`, with no project id in it.

Set `proyecto_id_destino` to `null` to take the component out of every project. It returns to the virtual `ALL` project; nothing is destroyed. This is how Studio unassigns, since `DELETE /proyectos/{id}/componentes` rejects the Studio credential.

Response: `{"movido": true, "tipo": "app", "componente_id": "3600f621-…", "proyecto_id_destino": 7}`.

---

## Errors

| Status | Message | What it means | What to do |
|---|---|---|---|
| `401` | on any DELETE | Studio never deletes, by design | Tell the user to use the web interface |
| `401` | `Invalid or revoked Studio API key` | Key wrong, revoked, or not `tipo='studio'` | Regenerate it at app.puente.xyz → Configuración |
| `401` | `Not authenticated` | No `X-API-Key` header at all | Add the header |
| `403` | `Studio API key cannot access the requested team` | An `equipo_id` other than the key's was sent | Omit the field entirely |
| `404` | `El componente {tipo}/{id} no existe en tu equipo` | Wrong identifier, or the component is another team's | Re-resolve it with `GET /proyectos/all_components` |
| `404` | `Proyecto no encontrado.` | The project does not exist or belongs to another team | Verify with `GET /proyectos` |
| `404` | `Tarea no encontrada.` | The task does not exist in that project | Verify with `GET /proyectos/{id}/tareas` |
| `400` | `Debes enviar al menos un campo para actualizar` | Empty PUT body | Include at least one field |
| `400` | `Estado inválido` | State outside the enum | Use `backlog`, `pending`, `on_going` or `done` |
| `400` | `Tipo de componente inválido` | `tipo` outside the enum | Use `app`, `workflow`, `tabla` or `agente` |
| `422` | validation error | Wrong field type or shape | Read the message: it names the field |

A 401 on a DELETE and a 401 from a bad key look alike at the status level. Tell them apart by the method: if you sent a DELETE, the credential is working fine and the operation is simply not available to it.
