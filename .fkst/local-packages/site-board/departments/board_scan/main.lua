local core = require("core")
local text = require("text.trim")
-- Cross-repo: 库 B's published `contract` library, consumed by exact git sha
-- via [[external_sources]] in fkst.workspace.toml (resolved sha in fkst.lock).
local contract_strings = require("contract.strings")

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
  -- Trigger trace: exercises the website's own text library (text.trim via lib_deps) and
  -- proves the cross-package event subscription to idle-detector.system_idle is
  -- delivered (event.queue is board_poll_tick or idle-detector.system_idle).
  core.log_line("info", "board_scan", "TRIGGER", {
    "queue=" .. text.trim(tostring(event and event.queue or "")),
    -- contract.strings.json_string resolves cross-repo from 库 B @ locked sha.
    "contract_probe=" .. contract_strings.json_string(text.trim(tostring(event and event.queue or ""))),
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

  local board_json, build_err = core.build_board_json(repo, issues_raw, prs_raw)
  if board_json == nil then
    error("board snapshot build failed: " .. tostring(build_err))
  end
  local hash = exec_sync({ cmd = core.sha256_hex_cmd(board_json), timeout = 30 })
  if hash.exit_code ~= 0 then
    error("board sha256 failed: " .. tostring(hash.stderr))
  end
  local board_sha256, hash_err = core.parse_sha256_hex_output(hash.stdout)
  if board_sha256 == nil then
    error("board sha256 failed: " .. tostring(hash_err))
  end
  local manifest_json = core.build_manifest_json(board_sha256)
  local site_out = core.site_out_dir(core.read_env("FKST_SITE_OUT"))

  local write = exec_sync({ cmd = core.write_outputs_cmd(site_out, board_json, manifest_json), timeout = 30 })
  if write.exit_code ~= 0 then
    error("board data write failed: " .. tostring(write.stderr))
  end

  core.log_line("info", "board_scan", "OUTBOUND", {
    "mode=data",
    "repo=" .. repo,
    "bytes=" .. tostring(#board_json),
    "path=" .. site_out .. "/" .. core.BOARD_FILENAME,
    "manifest=" .. site_out .. "/" .. core.MANIFEST_FILENAME,
  })
end

return M
