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

local function right_rotate(value, count, bit)
  return bit.bor(bit.rshift(value, count), bit.lshift(value, 32 - count)) % 4294967296
end

local function add32(...)
  local sum = 0
  for index = 1, select("#", ...) do
    sum = (sum + select(index, ...)) % 4294967296
  end
  return sum
end

local function bit_ops()
  if bit32 ~= nil then
    return bit32
  end
  local function bit_pair(a, b, pick)
    a = a % 4294967296
    b = b % 4294967296
    local result = 0
    local place = 1
    while a > 0 or b > 0 do
      local abit = a % 2
      local bbit = b % 2
      if pick(abit, bbit) then
        result = result + place
      end
      a = (a - abit) / 2
      b = (b - bbit) / 2
      place = place * 2
    end
    return result
  end
  return {
    band = function(a, b)
      return bit_pair(a, b, function(abit, bbit)
        return abit == 1 and bbit == 1
      end)
    end,
    bor = function(a, b)
      return bit_pair(a, b, function(abit, bbit)
        return abit == 1 or bbit == 1
      end)
    end,
    bxor = function(a, b)
      return bit_pair(a, b, function(abit, bbit)
        return abit ~= bbit
      end)
    end,
    bnot = function(a)
      return 4294967295 - (a % 4294967296)
    end,
    rshift = function(a, b)
      return math.floor((a % 4294967296) / 2 ^ b)
    end,
    lshift = function(a, b)
      return (a * 2 ^ b) % 4294967296
    end,
  }
end

function M.sha256_hex(message)
  if type(message) ~= "string" then
    error("sha256 input must be a string")
  end
  local bit = bit_ops()
  local constants = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  }
  local hash = {
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  }
  local bytes = { string.byte(message, 1, #message) }
  local bit_length = #bytes * 8
  table.insert(bytes, 0x80)
  while #bytes % 64 ~= 56 do
    table.insert(bytes, 0)
  end
  local high = math.floor(bit_length / 4294967296)
  local low = bit_length % 4294967296
  for shift = 24, 0, -8 do
    table.insert(bytes, math.floor(high / 2 ^ shift) % 256)
  end
  for shift = 24, 0, -8 do
    table.insert(bytes, math.floor(low / 2 ^ shift) % 256)
  end

  for chunk_start = 1, #bytes, 64 do
    local words = {}
    for index = 0, 15 do
      local base = chunk_start + index * 4
      words[index + 1] = bytes[base] * 16777216
        + bytes[base + 1] * 65536
        + bytes[base + 2] * 256
        + bytes[base + 3]
    end
    for index = 17, 64 do
      local s0 = bit.bxor(
        bit.bxor(right_rotate(words[index - 15], 7, bit), right_rotate(words[index - 15], 18, bit)),
        bit.rshift(words[index - 15], 3)
      )
      local s1 = bit.bxor(
        bit.bxor(right_rotate(words[index - 2], 17, bit), right_rotate(words[index - 2], 19, bit)),
        bit.rshift(words[index - 2], 10)
      )
      words[index] = add32(words[index - 16], s0, words[index - 7], s1)
    end

    local a, b, c, d, e, f, g, h = hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7], hash[8]
    for index = 1, 64 do
      local sum1 = bit.bxor(bit.bxor(right_rotate(e, 6, bit), right_rotate(e, 11, bit)), right_rotate(e, 25, bit))
      local choice = bit.bxor(bit.band(e, f), bit.band(bit.bnot(e), g))
      local temp1 = add32(h, sum1, choice, constants[index], words[index])
      local sum0 = bit.bxor(bit.bxor(right_rotate(a, 2, bit), right_rotate(a, 13, bit)), right_rotate(a, 22, bit))
      local majority = bit.bxor(bit.bxor(bit.band(a, b), bit.band(a, c)), bit.band(b, c))
      local temp2 = add32(sum0, majority)
      h = g
      g = f
      f = e
      e = add32(d, temp1)
      d = c
      c = b
      b = a
      a = add32(temp1, temp2)
    end

    hash[1] = add32(hash[1], a)
    hash[2] = add32(hash[2], b)
    hash[3] = add32(hash[3], c)
    hash[4] = add32(hash[4], d)
    hash[5] = add32(hash[5], e)
    hash[6] = add32(hash[6], f)
    hash[7] = add32(hash[7], g)
    hash[8] = add32(hash[8], h)
  end

  local parts = {}
  for _, value in ipairs(hash) do
    table.insert(parts, string.format("%08x", value))
  end
  return table.concat(parts, "")
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

function M.build_manifest_json(board_json)
  if type(board_json) ~= "string" then
    error("board_json must be a string")
  end
  return '{"documents":[{"path":'
    .. json_string(M.BOARD_FILENAME)
    .. ',"schema_version":'
    .. json_string(M.BOARD_SCHEMA_VERSION)
    .. ',"sha256":'
    .. json_string(M.sha256_hex(board_json))
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
