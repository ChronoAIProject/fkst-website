local M = {}

M.BOARD_SCHEMA_VERSION = "fkst.site.board.v1"
M.BOARD_FILENAME = "fkst.site.board.v1.json"
M.MANIFEST_SCHEMA_VERSION = "fkst.site.data.manifest.v1"
M.MANIFEST_FILENAME = "manifest.json"
M.DEFAULT_SITE_OUT = "build/fkst/data"

function M.persistence_class()
  return "stateless_adapter"
end

-- Env access goes through exec_sync so tests can mock it and unmocked reads
-- fail closed in test mode. Only allowlisted names are readable.
local ENV_ALLOWLIST = {
  FKST_GITHUB_REPO = true,
  FKST_SITE_OUT = true,
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

local function trim_trailing_slashes(value)
  local trimmed = tostring(value)
  while #trimmed > 1 and trimmed:sub(-1) == "/" do
    trimmed = trimmed:sub(1, -2)
  end
  return trimmed
end

local function normalise_relative_path(value)
  local path = tostring(value):gsub("/+", "/")
  while path:sub(1, 2) == "./" do
    path = path:sub(3)
  end
  return path
end

function M.site_out_dir(value)
  local out = value
  if out == nil or out == "" then
    out = M.DEFAULT_SITE_OUT
  end
  if type(out) ~= "string" then
    error("FKST_SITE_OUT must be a path string")
  end
  if out:find("%z") or out:find("\n", 1, true) or out:find("\r", 1, true) then
    error("FKST_SITE_OUT contains an invalid path character")
  end
  out = trim_trailing_slashes(out)
  local relative = normalise_relative_path(out)
  if relative == "site"
    or relative:sub(1, 5) == "site/"
    or relative:sub(-5) == "/site"
    or relative:find("/site/", 1, true) ~= nil then
    error("FKST_SITE_OUT must not point inside site/")
  end
  return out
end

function M.is_valid_repo(repo)
  return type(repo) == "string" and repo:match("^[%w._-]+/[%w._-]+$") ~= nil
end

-- Board fields are display data for the site; the snapshot decodes the gh JSON
-- arrays and re-encodes the supported fields in canonical order.
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
    return false, nil
  end
  if raw:match("^%s*%[") == nil then
    return false, nil
  end
  local ok, value = pcall(json.decode, raw)
  if not ok or type(value) ~= "table" then
    return false, nil
  end
  return true, value
end

local function is_json_object(raw)
  if type(raw) ~= "string" or raw == "" then
    return false, nil
  end
  if raw:match("^%s*{") == nil then
    return false, nil
  end
  local ok, value = pcall(json.decode, raw)
  if not ok or type(value) ~= "table" then
    return false, nil
  end
  return true, value
end

local function normalise_positive_integer(value)
  local number = value
  if type(value) == "string" and value:match("^%d+$") ~= nil then
    number = tonumber(value)
  end
  if type(number) ~= "number"
    or number ~= number
    or number == math.huge
    or number == -math.huge
    or math.floor(number) ~= number
    or number < 1 then
    return nil
  end
  return number
end

local QUEUE_STARVATION_REPAIR_QUEUES = {
  "consensus.consensus_reached",
  "github-devloop-pr.devloop_merge_ready",
  "github-devloop-pr.devloop_merge_queue_tick",
}

local function safe_diagnostic_token(value)
  if type(value) ~= "string" then
    return nil
  end
  if #value == 0 or #value > 120 then
    return nil
  end
  if value:match("^[%w%._%-/]+$") == nil then
    return nil
  end
  return value
end

local function append_queue_starvation_repair_fields(fields, body)
  table.insert(fields, "repair_scope=queue-dlq")
  table.insert(fields, "affected_queues=" .. table.concat(QUEUE_STARVATION_REPAIR_QUEUES, ","))
  table.insert(fields, "runbook=class-level-queue-dlq")

  local head_source = safe_diagnostic_token(body:match("Head source:%s*`([^`]+)`"))
  if head_source ~= nil then
    table.insert(fields, "head_source=" .. head_source)
  end
  local last_merge_age = body:match("Last merge age:%s*(%d+)")
  if last_merge_age ~= nil then
    table.insert(fields, "last_merge_age=" .. last_merge_age)
  end
end

function M.gh_issue_body_cmd(repo, issue_number)
  if not M.is_valid_repo(repo) then
    error("invalid repo: " .. tostring(repo))
  end
  local number = normalise_positive_integer(issue_number)
  if number == nil then
    error("invalid issue number: " .. tostring(issue_number))
  end
  return "gh issue view "
    .. tostring(number)
    .. " --repo "
    .. M.shell_single_quote(repo)
    .. " --json body"
end

function M.queue_starvation_issue_numbers(issues_raw)
  local issues_ok, issues = is_json_array(issues_raw)
  if not issues_ok then
    return nil, "issues payload is not a JSON array"
  end
  local numbers = {}
  for _, issue in ipairs(issues) do
    if type(issue) == "table"
      and issue.state == "OPEN"
      and type(issue.title) == "string"
      and issue.title:match("^Queue starvation:") ~= nil then
      local number = normalise_positive_integer(issue.number)
      if number == nil then
        return nil, "queue starvation issue number is invalid"
      end
      table.insert(numbers, number)
    end
  end
  table.sort(numbers)
  return numbers, nil
end

function M.queue_starvation_diagnostic_fields(issue_number, issue_body_raw, prs_raw)
  local issue = normalise_positive_integer(issue_number)
  if issue == nil then
    return nil, "invalid queue starvation issue number"
  end
  local body_ok, body_view = is_json_object(issue_body_raw)
  if not body_ok or type(body_view.body) ~= "string" then
    return nil, "queue starvation issue body is not available"
  end
  local prs_ok, prs = is_json_array(prs_raw)
  if not prs_ok then
    return nil, "prs payload is not a JSON array"
  end

  local head_issue = normalise_positive_integer(body_view.body:match("Queue head:%s*#(%d+)"))
  local head_pr = normalise_positive_integer(body_view.body:match("Queue head PR:%s*#(%d+)"))
  local fields = {
    "issue=" .. tostring(issue),
    "source=queue-starvation-watchdog",
    "incident_class=merge-ready-starvation",
  }
  if head_issue ~= nil then
    table.insert(fields, "head_issue=" .. tostring(head_issue))
  end
  if head_pr == nil then
    table.insert(fields, "diagnosis=missing-head-pr")
    append_queue_starvation_repair_fields(fields, body_view.body)
    table.insert(fields, "action=diagnose-only")
    return fields, nil
  end

  local head_pr_is_open = false
  for _, pr in ipairs(prs) do
    if type(pr) == "table" and normalise_positive_integer(pr.number) == head_pr then
      head_pr_is_open = true
      break
    end
  end

  local diagnosis = "head-pr-not-in-open-pr-snapshot"
  if head_pr_is_open then
    diagnosis = "head-pr-still-in-open-pr-snapshot"
  end

  table.insert(fields, "head_pr=" .. tostring(head_pr))
  table.insert(fields, "diagnosis=" .. diagnosis)
  append_queue_starvation_repair_fields(fields, body_view.body)
  table.insert(fields, "action=diagnose-only")
  return fields, nil
end

local function json_string(value)
  if type(value) ~= "string" then
    error("json_string requires a string")
  end
  return '"'
    .. value:gsub('[%z\001-\031\\"]', function(char)
      if char == '"' then
        return '\\"'
      end
      if char == "\\" then
        return "\\\\"
      end
      local byte = string.byte(char)
      if byte == 8 then
        return "\\b"
      end
      if byte == 9 then
        return "\\t"
      end
      if byte == 10 then
        return "\\n"
      end
      if byte == 12 then
        return "\\f"
      end
      if byte == 13 then
        return "\\r"
      end
      return string.format("\\u%04x", byte)
    end)
    .. '"'
end

local function json_number(value)
  if type(value) ~= "number" then
    error("json_number requires a number")
  end
  if value ~= value or value == math.huge or value == -math.huge then
    error("json_number requires a finite number")
  end
  if math.floor(value) == value then
    return string.format("%.0f", value)
  end
  return tostring(value)
end

local function sorted_string_keys(value)
  local keys = {}
  for key, item in pairs(value) do
    if type(key) == "string" and item ~= nil then
      table.insert(keys, key)
    end
  end
  table.sort(keys)
  return keys
end

local encode_json_value

local function encode_json_object(value)
  local parts = {}
  for _, key in ipairs(sorted_string_keys(value)) do
    table.insert(parts, json_string(key) .. ":" .. encode_json_value(value[key]))
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

function encode_json_value(value)
  local kind = type(value)
  if kind == "string" then
    return json_string(value)
  end
  if kind == "number" then
    return json_number(value)
  end
  if kind == "boolean" then
    if value then
      return "true"
    end
    return "false"
  end
  if kind == "nil" then
    return "null"
  end
  if kind == "table" then
    return encode_json_object(value)
  end
  error("unsupported JSON value type: " .. kind)
end

local function encode_label(label)
  local kind = type(label)
  if kind == "string" or kind == "number" or kind == "boolean" then
    return encode_json_value(label)
  end
  if kind == "table" then
    return encode_json_object(label)
  end
  return nil, "label has unsupported type: " .. kind
end

local function encode_labels(labels, context)
  if type(labels) ~= "table" then
    return nil, context .. " labels is not an array"
  end
  local parts = {}
  for index, label in ipairs(labels) do
    local encoded, err = encode_label(label)
    if encoded == nil then
      return nil, context .. " label " .. tostring(index) .. ": " .. tostring(err)
    end
    table.insert(parts, encoded)
  end
  return "[" .. table.concat(parts, ",") .. "]"
end

local function require_field(item, field, field_type, context)
  local value = item[field]
  if type(value) ~= field_type then
    return nil, context .. " " .. field .. " is not a " .. field_type
  end
  return value, nil
end

local function encode_board_item(item, context)
  if type(item) ~= "table" then
    return nil, context .. " entry is not an object"
  end
  local labels, labels_err = encode_labels(item.labels, context)
  if labels == nil then
    return nil, labels_err
  end
  local number, err = require_field(item, "number", "number", context)
  if err ~= nil then
    return nil, err
  end
  local state
  state, err = require_field(item, "state", "string", context)
  if err ~= nil then
    return nil, err
  end
  local title
  title, err = require_field(item, "title", "string", context)
  if err ~= nil then
    return nil, err
  end
  local updated_at
  updated_at, err = require_field(item, "updatedAt", "string", context)
  if err ~= nil then
    return nil, err
  end
  local url
  url, err = require_field(item, "url", "string", context)
  if err ~= nil then
    return nil, err
  end
  return '{"labels":'
    .. labels
    .. ',"number":'
    .. json_number(number)
    .. ',"state":'
    .. json_string(state)
    .. ',"title":'
    .. json_string(title)
    .. ',"updatedAt":'
    .. json_string(updated_at)
    .. ',"url":'
    .. json_string(url)
    .. "}"
end

local function encode_board_list(items, context)
  local parts = {}
  for index, item in ipairs(items) do
    local encoded, err = encode_board_item(item, context .. " " .. tostring(index))
    if encoded == nil then
      return nil, err
    end
    table.insert(parts, encoded)
  end
  return "[" .. table.concat(parts, ",") .. "]"
end

function M.sha256_hex_cmd(message)
  if type(message) ~= "string" then
    error("sha256 input must be a string")
  end
  local quoted = M.shell_single_quote(message)
  return "if command -v sha256sum >/dev/null 2>&1; then printf %s "
    .. quoted
    .. " | sha256sum | awk '{print $1}'; elif command -v shasum >/dev/null 2>&1; then printf %s "
    .. quoted
    .. " | shasum -a 256 | awk '{print $1}'; else echo 'sha256 command not found' >&2; exit 127; fi"
end

local function normalise_sha256_hex(value)
  if type(value) ~= "string" then
    return nil, "sha256 must be a string"
  end
  if #value ~= 64 or value:match("^[0-9a-fA-F]+$") == nil then
    return nil, "sha256 must be 64 hex characters"
  end
  return value:lower(), nil
end

function M.parse_sha256_hex_output(stdout)
  if type(stdout) ~= "string" then
    return nil, "sha256 command stdout is not a string"
  end
  local digest = stdout:match("^%s*([0-9a-fA-F]+)")
  if digest == nil then
    return nil, "sha256 command did not return a digest"
  end
  return normalise_sha256_hex(digest)
end

-- Build the FKST data-layer board document from validated GitHub JSON arrays.
function M.build_board_json(repo, issues_raw, prs_raw)
  if not M.is_valid_repo(repo) then
    return nil, "invalid repo"
  end
  local issues_ok, issues = is_json_array(issues_raw)
  if not issues_ok then
    return nil, "issues payload is not a JSON array"
  end
  local prs_ok, prs = is_json_array(prs_raw)
  if not prs_ok then
    return nil, "prs payload is not a JSON array"
  end
  local issues_json, issues_err = encode_board_list(issues, "issue")
  if issues_json == nil then
    return nil, issues_err
  end
  local prs_json, prs_err = encode_board_list(prs, "pr")
  if prs_json == nil then
    return nil, prs_err
  end
  return '{"issues":'
    .. issues_json
    .. ',"prs":'
    .. prs_json
    .. ',"repo":'
    .. json_string(repo)
    .. ',"schema_version":'
    .. json_string(M.BOARD_SCHEMA_VERSION)
    .. "}"
end

function M.build_manifest_json(board_sha256)
  local digest, err = normalise_sha256_hex(board_sha256)
  if digest == nil then
    error(err)
  end
  return '{"documents":[{"path":'
    .. json_string(M.BOARD_FILENAME)
    .. ',"schema_version":'
    .. json_string(M.BOARD_SCHEMA_VERSION)
    .. ',"sha256":'
    .. json_string(digest)
    .. '}],"schema_version":'
    .. json_string(M.MANIFEST_SCHEMA_VERSION)
    .. "}"
end

-- Atomic data writes: each generated document is written to a temp file then
-- renamed into place, so readers never observe a half-written JSON file.
function M.write_outputs_cmd(site_out, board_json, manifest_json)
  local out = M.site_out_dir(site_out)
  if type(board_json) ~= "string" then
    error("board_json must be a string")
  end
  if type(manifest_json) ~= "string" then
    error("manifest_json must be a string")
  end
  local root = M.shell_single_quote(out)
  local board_tmp = M.shell_single_quote(out .. "/" .. M.BOARD_FILENAME .. ".tmp")
  local board_final = M.shell_single_quote(out .. "/" .. M.BOARD_FILENAME)
  local manifest_tmp = M.shell_single_quote(out .. "/" .. M.MANIFEST_FILENAME .. ".tmp")
  local manifest_final = M.shell_single_quote(out .. "/" .. M.MANIFEST_FILENAME)
  return "mkdir -p "
    .. root
    .. " && printf %s "
    .. M.shell_single_quote(board_json)
    .. " > "
    .. board_tmp
    .. " && printf %s "
    .. M.shell_single_quote(manifest_json)
    .. " > "
    .. manifest_tmp
    .. " && mv "
    .. board_tmp
    .. " "
    .. board_final
    .. " && mv "
    .. manifest_tmp
    .. " "
    .. manifest_final
end

return M
