local core = require("core")

local M = {}

M.spec = {
  consumes = { "board_poll_tick" },
  fanout = { "board_poll_tick" },
  stall_window = "30s",
}

local function manifest_path()
  return "site/probe-manifest"
end

local function probe_path(path)
  local result = exec_sync({ cmd = core.curl_probe_cmd(path), timeout = 30 })
  return core.classify_probe_result(result)
end

function pipeline(event)
  local paths, manifest_err = core.read_probe_manifest(manifest_path())
  if paths == nil then
    error("site probe manifest failed: " .. tostring(manifest_err))
  end

  local statuses = {}
  local failures = {}
  local network_errors = 0
  for _, path in ipairs(paths) do
    local code = probe_path(path)
    table.insert(statuses, { path = path, code = code })
    if code == "error" then
      network_errors = network_errors + 1
    elseif code ~= "200" then
      table.insert(failures, { path = path, code = code })
    end
  end

  if network_errors == #statuses then
    core.log_line("warn", "probe_scan", "skip", core.probe_log_fields(statuses, {
      "reason=all-paths-network-error",
    }))
    return
  end

  if #failures > 0 then
    core.log_line("warn", "probe_scan", "fail", core.probe_log_fields(failures, {
      "checked=" .. tostring(#statuses),
    }))
    return
  end

  core.log_line("info", "probe_scan", "ok", core.probe_log_fields(statuses))
end

return M
