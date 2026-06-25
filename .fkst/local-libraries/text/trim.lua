-- fkst-website's host-owned text library. It keeps the host library
-- lib_deps path covered while cross-repo package integration stays queue-only;
-- only named publishable libraries such as contract cross repo boundaries.
local M = {}

-- Trim leading/trailing ASCII whitespace. Pure, nil-safe.
function M.trim(s)
  return (tostring(s):gsub("^%s+", ""):gsub("%s+$", ""))
end

return M
