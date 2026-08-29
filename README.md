# Puente OS public agent skills

Official public skills for Puente Studio applications and workflows. The repository is a native marketplace for both Claude Code and Codex.

The single `skills/` directory is canonical. Do not create mirrored `.agents/skills/` or `.claude/skills/` copies.

## Available skills

| Skill | Purpose |
|---|---|
| `puente-studio` | Build and manage Puente Studio applications, artifacts, tables, and publication workflows. |
| `manage-puente-workflows` | Manage workflow definitions, integrations, Gmail, and Google Sheets. |
| `manage-puente-projects` | Organize apps, tables, workflows, and agents into projects with Kanban task boards. |

The initial public skills were migrated from [`octaviofv/puente_studio_repo`](https://github.com/octaviofv/puente_studio_repo) at commit [`0291073`](https://github.com/octaviofv/puente_studio_repo/commit/0291073da18fabac93ead97a33354d6e779c89be). Future marketplace changes should be made in this repository's canonical `skills/` tree.

## Install with Claude Code

Run these commands inside Claude Code:

```text
/plugin marketplace add puente-os/agent-skills
/plugin install puente-os@skills
```

To receive a new release after the plugin version is bumped, update the marketplace and then update the plugin from Claude Code's `/plugin` interface.

## Install with Codex

```bash
codex plugin marketplace add puente-os/agent-skills
codex plugin add puente-os@skills
```

To refresh the marketplace and install the current release:

```bash
codex plugin marketplace upgrade skills
codex plugin add puente-os@skills
```

## Project configuration

Skills read `BASE_URL` and `STUDIO_KEY` from exported environment variables or the consuming project's ignored `.env`. Never put credentials in this marketplace repository or in a plugin-cache directory.

The `puente-studio` helper scripts are bundled inside the skill. They resolve `app/files`, `app/output.json`, and `.env` from the current working directory, so the marketplace installation remains self-contained.

## Development and releases

1. Edit only the canonical `skills/` tree and the native manifests.
2. Run `python3 scripts/check.py` and validate every changed skill.
3. Bump the matching version in `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` whenever installed plugin contents change.
4. Merge through a pull request. Clients can then refresh the marketplace and install or update the new version.
