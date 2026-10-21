# Puente OS public agent skills

Official public skills for Puente Studio applications and workflows. The repository is a native marketplace for both Claude Code and Codex.

The single `skills/` directory is canonical. Do not create mirrored `.agents/skills/` or `.claude/skills/` copies.

## Available skills

| Skill | Purpose |
|---|---|
| `puente-studio` | Build and manage Puente Studio applications, artifacts, tables, and publication workflows. |
| `manage-puente-workflows` | Manage workflow definitions and integrations; explain workflow errors and recovery steps. |
| `manage-puente-projects` | Organize apps, tables, workflows, and agents into projects with Kanban task boards. |

The initial public skills were migrated from [`octaviofv/puente_studio_repo`](https://github.com/octaviofv/puente_studio_repo) at commit [`0291073`](https://github.com/octaviofv/puente_studio_repo/commit/0291073da18fabac93ead97a33354d6e779c89be). Future marketplace changes should be made in this repository's canonical `skills/` tree.

## Install with Claude Code

Run these commands inside Claude Code:

```text
/plugin marketplace add puente-os/agent-skills
/plugin install puente-os@skills
```

### Automatic updates

Claude Code leaves automatic updates off by default for third-party marketplaces such as this one. Enable them once:

1. Run `/plugin` inside Claude Code.
2. Open **Marketplaces** and select **skills**.
3. Select **Enable auto-update**.

Claude Code then refreshes this marketplace and updates its installed plugins in the background after a session starts. The current session keeps its loaded version; run `/reload-plugins` after an update or start a new session to load it.

### Manual update fallback

If automatic updates are disabled or an update does not arrive, run these commands in your terminal:

```bash
claude plugin marketplace update skills
claude plugin update puente-os@skills
```

Then run `/reload-plugins` in Claude Code or start a new session. See the [Claude Code update documentation](https://code.claude.com/docs/en/plugins/install#keep-plugins-updated).

## Install with Codex

```bash
codex plugin marketplace add puente-os/agent-skills
codex plugin add puente-os@skills
```

### Automatic updates

Codex automatically refreshes configured Git marketplaces, including manually added third-party marketplaces, and updates their installed plugins at startup. This behavior is verified in [Codex 0.154.0](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/core-plugins/src/manager.rs#L2752).

For Codex desktop, fully quit and reopen the app to start the background update. For the Codex CLI, exit and start it again. Updates require network access and are not immediate. Do not assume that an app left open continuously will check for new releases on a fixed schedule.

### Manual update fallback

If the startup update fails or you need to refresh the installed plugin explicitly, run these commands in your terminal:

```bash
codex plugin marketplace upgrade skills
codex plugin add puente-os@skills
```

Then reopen Codex or start a new CLI session to use the updated skills.

## Project configuration

Skills read `BASE_URL` and `STUDIO_KEY` from exported environment variables or the consuming project's ignored `.env`. Never put credentials in this marketplace repository or in a plugin-cache directory.

The `puente-studio` helper scripts are bundled inside the skill. They resolve `app/files`, `app/output.json`, and `.env` from the current working directory, so the marketplace installation remains self-contained.

## Development and releases

1. Edit only the canonical `skills/` tree and the native manifests.
2. Run `python3 scripts/check.py` and validate every changed skill.
3. Bump the matching version in `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` whenever installed plugin contents change.
4. Merge through a pull request. Clients with automatic updates receive the new version on startup as described above; other clients can use the manual update commands.
