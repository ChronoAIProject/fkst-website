local core = require("core")
local text = require("std.text")

local M = {}

M.spec = {
  consumes = { "board_poll_tick", "idle-detector.system_idle" },
  stall_window = "30s",
}

local function fetch_list(cmd, context)
  local result = exec_sync({ cmd = cmd, timeout = 30 })
  if result.exit_code ~= 0 then
    error(context .. " failed: " .. tostring(result.stderr))
  end
  return result.stdout
end

function pipeline(event)
  -- Trigger trace: exercises the website's own std (std.text via lib_deps) and
  -- proves the cross-package event subscription to idle-detector.system_idle is
  -- delivered (event.queue is board_poll_tick or idle-detector.system_idle).
  core.log_line("info", "board_scan", "TRIGGER", {
    "queue=" .. text.trim(tostring(event and event.queue or "")),
  })
  local repo = core.read_env("FKST_GITHUB_REPO")
  if repo == nil then
    core.log_line("warn", "board_scan", "SKIP", { "reason=FKST_GITHUB_REPO is unset" })
    return
  end
  if not core.is_valid_repo(repo) then
    core.log_line("warn", "board_scan", "SKIP", { "reason=FKST_GITHUB_REPO is malformed" })
    return
  end

  local issues_raw = fetch_list(core.gh_issue_list_cmd(repo), "gh issue list")
  local prs_raw = fetch_list(core.gh_pr_list_cmd(repo), "gh pr list")

  local board_json, build_err = core.build_board_json(repo, issues_raw, prs_raw, now())
  if board_json == nil then
    error("board snapshot build failed: " .. tostring(build_err))
  end

  local write_env = core.read_env("FKST_SITE_WRITE")
  if write_env ~= "1" then
    core.log_line("info", "board_scan", "OUTBOUND", {
      "mode=dry-run",
      "repo=" .. repo,
      "bytes=" .. tostring(#board_json),
      "reason=FKST_SITE_WRITE!=1",
    })
    return
  end

  -- Fail closed: real write posture without a publish root is a config error,
  -- not a silent dry-run.
  local publish_root = core.read_env("FKST_SITE_PUBLISH_ROOT")
  if publish_root == nil then
    error("FKST_SITE_WRITE=1 requires FKST_SITE_PUBLISH_ROOT")
  end

  local publish = exec_sync({ cmd = core.publish_cmd(publish_root, board_json), timeout = 30 })
  if publish.exit_code ~= 0 then
    error("board publish failed: " .. tostring(publish.stderr))
  end

  core.log_line("info", "board_scan", "OUTBOUND", {
    "mode=real",
    "repo=" .. repo,
    "bytes=" .. tostring(#board_json),
    "path=" .. publish_root .. "/board.json",
  })
end

return M
