local t = fkst.test
local core = require("core")

local function nonce()
  return tostring({}):gsub("[^%w._-]", "_")
end

local function runtime_root(name)
  return "/tmp/fkst-website-test/site-board/" .. tostring(now()) .. "/" .. nonce() .. "/" .. name
end

local function opts(name)
  return {
    env = {
      FKST_RUNTIME_ROOT = runtime_root(name),
    },
  }
end

local ISSUES_JSON = '[{"number":1,"title":"An issue","state":"OPEN","labels":[],"updatedAt":"2026-06-10T01:02:03Z","url":"https://github.example/owner/x/issues/1"}]\n'
local PRS_JSON = '[{"number":2,"title":"A PR","state":"OPEN","labels":[],"updatedAt":"2026-06-10T02:03:04Z","url":"https://github.example/owner/x/pull/2"}]\n'

local function mock_repo_env(value)
  t.mock_command('printf %s "$FKST_GITHUB_REPO"', { stdout = value or "owner/x" })
end

local function mock_write_env(value)
  t.mock_command('printf %s "$FKST_SITE_WRITE"', { stdout = value or "" })
end

local function mock_publish_root_env(value)
  t.mock_command('printf %s "$FKST_SITE_PUBLISH_ROOT"', { stdout = value or "" })
end

local function mock_lists(issues, prs)
  t.mock_command("gh issue list", { stdout = issues or ISSUES_JSON, exit_code = 0 })
  t.mock_command("gh pr list", { stdout = prs or PRS_JSON, exit_code = 0 })
end

local function run_scan(run_opts)
  return t.run_department("departments/board_scan/main.lua", {
    queue = "board_poll_tick",
    payload = {},
  }, run_opts)
end

local function publish_calls()
  local calls = {}
  for _, call in ipairs(t.command_calls()) do
    if call.rendered:find("board.json", 1, true) ~= nil then
      table.insert(calls, call)
    end
  end
  return calls
end

return {
  test_persistence_class_is_stateless_adapter = function()
    t.eq(core.persistence_class(), "stateless_adapter")
  end,

  test_read_env_command_rejects_unknown_name = function()
    t.eq(core.read_env_command("FKST_GITHUB_REPO"), 'printf %s "$FKST_GITHUB_REPO"')
    local ok = pcall(core.read_env_command, "PATH")
    t.eq(ok, false)
  end,

  test_repo_validation = function()
    t.eq(core.is_valid_repo("owner/x"), true)
    t.eq(core.is_valid_repo("owner"), false)
    t.eq(core.is_valid_repo("owner/x; rm -rf /"), false)
    t.eq(core.is_valid_repo(nil), false)
  end,

  test_list_cmds_quote_repo = function()
    t.eq(
      core.gh_issue_list_cmd("owner/x"),
      "gh issue list --repo 'owner/x' --state open --limit 1000 --json number,title,state,labels,updatedAt,url"
    )
    t.eq(
      core.gh_pr_list_cmd("owner/x"),
      "gh pr list --repo 'owner/x' --state open --limit 1000 --json number,title,state,labels,updatedAt,url"
    )
    local ok = pcall(core.gh_issue_list_cmd, "bad repo name")
    t.eq(ok, false)
  end,

  test_build_board_json_embeds_validated_chunks = function()
    local board = core.build_board_json("owner/x", ISSUES_JSON, PRS_JSON, 1781070000000)
    t.is_true(board ~= nil)
    local decoded = json.decode(board)
    t.eq(decoded.schema, "fkst-website.board.v1")
    t.eq(decoded.repo, "owner/x")
    t.eq(decoded.generated_at_ms, 1781070000000)
    t.eq(decoded.issues[1].number, 1)
    t.eq(decoded.prs[1].number, 2)
  end,

  test_build_board_json_fails_closed_on_bad_input = function()
    local board, err = core.build_board_json("owner/x", "not json", PRS_JSON, 0)
    t.eq(board, nil)
    t.is_true(err:find("issues", 1, true) ~= nil)
    board, err = core.build_board_json("owner/x", ISSUES_JSON, "{}", 0)
    t.eq(board, nil)
    t.is_true(err:find("prs", 1, true) ~= nil)
    board, err = core.build_board_json("owner/x", ISSUES_JSON, '  {"message":"bad"}', 0)
    t.eq(board, nil)
    t.is_true(err:find("prs", 1, true) ~= nil)
    board, err = core.build_board_json("owner/x", ISSUES_JSON, "  []\n", 0)
    t.is_true(board ~= nil)
    board, err = core.build_board_json("owner/x", ISSUES_JSON, "", 0)
    t.eq(board, nil)
    board, err = core.build_board_json("bad repo", ISSUES_JSON, PRS_JSON, 0)
    t.eq(board, nil)
  end,

  test_publish_cmd_is_atomic_and_quoted = function()
    local cmd = core.publish_cmd("/srv/site", '{"a":1}')
    t.is_true(cmd:find("mkdir -p '/srv/site'", 1, true) ~= nil)
    t.is_true(cmd:find("board.json.tmp", 1, true) ~= nil)
    t.is_true(cmd:find("mv '/srv/site/board.json.tmp' '/srv/site/board.json'", 1, true) ~= nil)
    local ok = pcall(core.publish_cmd, "relative/path", "{}")
    t.eq(ok, false)
  end,

  test_scan_dry_run_fetches_but_does_not_publish = function()
    mock_repo_env()
    mock_lists()
    mock_write_env("")
    local result = run_scan(opts("dry-run"))
    t.eq(result.exit_code, 0)
    t.eq(#result.raises, 0)
    t.eq(#publish_calls(), 0)
  end,

  test_scan_skips_without_repo_env = function()
    mock_repo_env("")
    local result = run_scan(opts("no-repo"))
    t.eq(result.exit_code, 0)
    t.eq(#publish_calls(), 0)
  end,

  test_scan_real_write_publishes_board_json = function()
    mock_repo_env()
    mock_lists()
    mock_write_env("1")
    mock_publish_root_env("/tmp/site-pub")
    t.mock_command("mkdir -p", { stdout = "", exit_code = 0 })
    local result = run_scan(opts("real-write"))
    t.eq(result.exit_code, 0)
    local calls = publish_calls()
    t.eq(#calls, 1)
    t.is_true(calls[1].rendered:find("fkst-website.board.v1", 1, true) ~= nil)
    t.is_true(calls[1].rendered:find("mv '/tmp/site-pub/board.json.tmp' '/tmp/site-pub/board.json'", 1, true) ~= nil)
  end,

  test_scan_real_write_without_publish_root_fails_closed = function()
    mock_repo_env()
    mock_lists()
    mock_write_env("1")
    mock_publish_root_env("")
    local result = run_scan(opts("no-publish-root"))
    t.is_true(result.exit_code ~= 0)
    t.eq(#publish_calls(), 0)
  end,

  test_scan_errors_when_gh_fails = function()
    mock_repo_env()
    t.mock_command("gh issue list", { stdout = "", stderr = "boom", exit_code = 1 })
    t.mock_command("gh pr list", { stdout = PRS_JSON, exit_code = 0 })
    local result = run_scan(opts("gh-fails"))
    t.is_true(result.exit_code ~= 0)
    t.eq(#publish_calls(), 0)
  end,
}
