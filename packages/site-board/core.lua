local M = {}

-- Env access goes through exec_sync so tests can mock it and unmocked reads
-- fail closed in test mode. Only allowlisted names are readable.
local ENV_ALLOWLIST = {
  FKST_GITHUB_REPO = true,
  FKST_SITE_WRITE = true,
  FKST_SITE_PUBLISH_ROOT = true,
}

function M.read_env_command(name)
  if not ENV_ALLOWLIST[name] then
    error("env name is not allowed: " .. tostring(name))
  end
  return 'printf %s "$' .. name .. '"'
end

function M.read_env(name, exec)
  local run = exec or exec_sync
  if type(run) ~= "function" then
    error("read_env requires exec_sync")
  end
  local out = run(M.read_env_command(name))
  if out.exit_code ~= 0 then
    return nil
  end
  if out.stdout == "" then
    return nil
  end
  return out.stdout
end

function M.log_line(level, dept, tag, fields)
  local parts = {
    "fkst-website",
    "dept=" .. tostring(dept),
    "tag=" .. tostring(tag),
  }
  for _, field in ipairs(fields or {}) do
    table.insert(parts, field)
  end
  local line = table.concat(parts, " ")
  if level == "warn" then
    log.warn(line)
  elseif level == "error" then
    log.error(line)
  else
    log.info(line)
  end
end

function M.shell_single_quote(value)
  return "'" .. tostring(value):gsub("'", "'\\''") .. "'"
end

function M.is_valid_repo(repo)
  return type(repo) == "string" and repo:match("^[%w._-]+/[%w._-]+$") ~= nil
end

-- Board fields are display data for the site; the snapshot embeds the gh JSON
-- verbatim so no encode step exists in the package (the SDK only decodes).
local BOARD_FIELDS = "number,title,state,labels,updatedAt,url"

function M.gh_issue_list_cmd(repo)
  if not M.is_valid_repo(repo) then
    error("invalid repo: " .. tostring(repo))
  end
  return "gh issue list --repo "
    .. M.shell_single_quote(repo)
    .. " --state open --limit 1000 --json "
    .. BOARD_FIELDS
end

function M.gh_pr_list_cmd(repo)
  if not M.is_valid_repo(repo) then
    error("invalid repo: " .. tostring(repo))
  end
  return "gh pr list --repo "
    .. M.shell_single_quote(repo)
    .. " --state open --limit 1000 --json "
    .. BOARD_FIELDS
end

local function is_json_array(raw)
  if type(raw) ~= "string" or raw == "" then
    return false
  end
  local ok, value = pcall(json.decode, raw)
  return ok and type(value) == "table"
end

-- Build the published board document. The issue/PR chunks come straight from
-- gh stdout and are validated as decodable JSON arrays before embedding;
-- repo is validated against the repo pattern, so plain concatenation cannot
-- produce malformed JSON.
function M.build_board_json(repo, issues_raw, prs_raw, generated_at_ms)
  if not M.is_valid_repo(repo) then
    return nil, "invalid repo"
  end
  if not is_json_array(issues_raw) then
    return nil, "issues payload is not a JSON array"
  end
  if not is_json_array(prs_raw) then
    return nil, "prs payload is not a JSON array"
  end
  local generated = tonumber(generated_at_ms)
  if generated == nil then
    return nil, "generated_at_ms is not a number"
  end
  return '{"schema":"fkst-website.board.v1","repo":"'
    .. repo
    .. '","generated_at_ms":'
    .. string.format("%.0f", generated)
    .. ',"issues":'
    .. issues_raw:gsub("%s+$", "")
    .. ',"prs":'
    .. prs_raw:gsub("%s+$", "")
    .. "}"
end

-- Atomic publish: write to a temp file then rename, so the site never reads a
-- half-written board.json.
function M.publish_cmd(publish_root, board_json)
  if type(publish_root) ~= "string" or publish_root:sub(1, 1) ~= "/" then
    error("publish root must be an absolute path")
  end
  local root = M.shell_single_quote(publish_root)
  local tmp = M.shell_single_quote(publish_root .. "/board.json.tmp")
  local final = M.shell_single_quote(publish_root .. "/board.json")
  return "mkdir -p "
    .. root
    .. " && printf %s "
    .. M.shell_single_quote(board_json)
    .. " > "
    .. tmp
    .. " && mv "
    .. tmp
    .. " "
    .. final
end

return M
