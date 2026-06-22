-- fkst-website's OWN minimal stdlib (库 C uses its own std, never 库 B's;
-- cross-repo integration with the platform packages is event-only via pkg.queue).
-- This module exercises the libdep lib_deps path for a website package.
local M = {}

-- Trim leading/trailing ASCII whitespace. Pure, nil-safe.
function M.trim(s)
  return (tostring(s):gsub("^%s+", ""):gsub("%s+$", ""))
end

return M
