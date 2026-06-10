local t = fkst.test
local core = require("core")

local function nonce()
  return tostring({}):gsub("[^%w._-]", "_")
end

local function runtime_root(name)
  return "/tmp/fkst-website-test/site-board-probe/" .. tostring(now()) .. "/" .. nonce() .. "/" .. name
end

local function opts(name)
  return {
    env = {
      FKST_RUNTIME_ROOT = runtime_root(name),
    },
  }
end

local function run_probe(run_opts)
  return t.run_department("departments/probe_scan/main.lua", {
    queue = "board_poll_tick",
    payload = {},
  }, run_opts)
end

local function mock_probe(path, code)
  t.mock_command(core.curl_probe_cmd(path), { stdout = code, exit_code = 0 })
end

local function mock_probe_error(path)
  t.mock_command(core.curl_probe_cmd(path), { stdout = "", stderr = "network down", exit_code = 7 })
end

local function github_issue_calls()
  local calls = {}
  for _, call in ipairs(t.command_calls()) do
    if call.rendered:find("gh issue", 1, true) ~= nil or call.rendered:find("github_issue_create_request", 1, true) ~= nil then
      table.insert(calls, call)
    end
  end
  return calls
end

return {
  test_manifest_is_canonical_page_list = function()
    local paths = core.read_probe_manifest("site/probe-manifest")
    t.eq(#paths, 6)
    t.eq(paths[1], "/")
    t.eq(paths[2], "/zh/")
    t.eq(paths[3], "/architecture.html")
    t.eq(paths[4], "/doctrine.html")
    t.eq(paths[5], "/zh/architecture.html")
    t.eq(paths[6], "/zh/doctrine.html")
  end,

  test_curl_probe_cmd_targets_published_site = function()
    t.eq(
      core.curl_probe_cmd("/architecture.html"),
      "curl -sL -o /dev/null -w '%{http_code}' -- 'https://chronoaiproject.github.io/fkst-website/architecture.html'"
    )
    local ok = pcall(core.curl_probe_cmd, "architecture.html")
    t.eq(ok, false)
  end,

  test_probe_all_200_logs_ok_without_issue_request = function()
    mock_probe("/", "200")
    mock_probe("/zh/", "200")
    mock_probe("/architecture.html", "200")
    mock_probe("/doctrine.html", "200")
    mock_probe("/zh/architecture.html", "200")
    mock_probe("/zh/doctrine.html", "200")

    local result = run_probe(opts("all-ok"))
    t.eq(result.exit_code, 0)
    t.eq(#result.raises, 0)
    t.eq(#github_issue_calls(), 0)
  end,

  test_probe_one_404_logs_failure_without_issue_request = function()
    mock_probe("/", "200")
    mock_probe("/zh/", "200")
    mock_probe("/architecture.html", "404")
    mock_probe("/doctrine.html", "200")
    mock_probe("/zh/architecture.html", "200")
    mock_probe("/zh/doctrine.html", "200")

    local result = run_probe(opts("one-404"))
    t.eq(result.exit_code, 0)
    t.eq(#result.raises, 0)
    t.eq(#github_issue_calls(), 0)
  end,

  test_probe_all_network_error_logs_skip_without_issue_request = function()
    mock_probe_error("/")
    mock_probe_error("/zh/")
    mock_probe_error("/architecture.html")
    mock_probe_error("/doctrine.html")
    mock_probe_error("/zh/architecture.html")
    mock_probe_error("/zh/doctrine.html")

    local result = run_probe(opts("all-network-error"))
    t.eq(result.exit_code, 0)
    t.eq(#result.raises, 0)
    t.eq(#github_issue_calls(), 0)
  end,
}
