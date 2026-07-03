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
local STARVATION_ISSUES_JSON = '[{"number":53,"title":"Queue starvation: merge-ready head #47 has no recent merge","state":"OPEN","labels":[],"updatedAt":"2026-06-10T04:05:06Z","url":"https://github.example/owner/x/issues/53"}]\n'
local STARVATION_ISSUE_BODY_JSON = '{"body":"Queue starvation watchdog fired from deterministic observability signals.\\n\\nQueue head: #47 site-build 2\\nQueue head PR: #2\\nQueue head age: 85 minutes\\nThreshold: 60 minutes\\n"}\n'
local STARVATION_DLQ_BODY_JSON = '{"body":"Queue starvation watchdog fired from deterministic observability signals.\\n\\nDetector: `queue-starvation`\\nQueue head: #68 Implement the foundational back-to-top button\\nQueue head PR: #69\\nQueue head age: 91 minutes\\nThreshold: 60 minutes\\nLast merge age: 3749\\nHead source: `observability-sample`\\n"}\n'
local SHUFFLED_ISSUES_JSON = '[{"url":"https://github.example/owner/x/issues/1","updatedAt":"2026-06-10T01:02:03Z","labels":[],"state":"OPEN","title":"An issue","number":1}]\n'
local SHUFFLED_PRS_JSON = '[{"url":"https://github.example/owner/x/pull/2","updatedAt":"2026-06-10T02:03:04Z","labels":[],"state":"OPEN","title":"A PR","number":2}]\n'

local EXPECTED_BOARD_JSON = '{"issues":[{"labels":[],"number":1,"state":"OPEN","title":"An issue","updatedAt":"2026-06-10T01:02:03Z","url":"https://github.example/owner/x/issues/1"}],"prs":[{"labels":[],"number":2,"state":"OPEN","title":"A PR","updatedAt":"2026-06-10T02:03:04Z","url":"https://github.example/owner/x/pull/2"}],"repo":"owner/x","schema_version":"fkst.site.board.v1"}'
local EXPECTED_BOARD_SHA256 = "747228d459b0feb59ded0243c8150475c638ba037c3b2c86242f115a2ff6cccd"

local function mock_repo_env(value)
  t.mock_command('printf %s "$FKST_GITHUB_REPO"', { stdout = value or "owner/x" })
end

local function mock_site_out_env(value)
  t.mock_command('printf %s "$FKST_SITE_OUT"', { stdout = value or "" })
end

local function mock_lists(issues, prs)
  t.mock_command("gh issue list", { stdout = issues or ISSUES_JSON, exit_code = 0 })
  t.mock_command("gh pr list --repo 'owner/x' --state open", { stdout = prs or PRS_JSON, exit_code = 0 })
end

local function mock_sha256(value)
  t.mock_command("sha256sum", { stdout = (value or EXPECTED_BOARD_SHA256) .. "  -\n", exit_code = 0 })
end

local function run_scan(run_opts)
  return t.run_department("departments/board_scan/main.lua", {
    queue = "board_poll_tick",
    payload = {},
  }, run_opts)
end

local function capture_scan_logs(run_opts)
  local captured = {}
  local old_log = log
  log = {
    info = function(message)
      table.insert(captured, tostring(message))
    end,
    warn = function(message)
      table.insert(captured, tostring(message))
    end,
    error = function(message)
      table.insert(captured, tostring(message))
    end,
  }

  local ok, result = pcall(function()
    local old_pipeline = pipeline
    require("departments.board_scan.main")
    local run = pipeline
    pipeline = old_pipeline
    if type(run) ~= "function" then
      error("board_scan pipeline missing")
    end
    run({
      queue = "board_poll_tick",
      payload = {},
    })
    return { exit_code = 0, raises = {} }
  end)

  log = old_log
  if not ok then
    error(result)
  end

  return captured, result
end

local function publish_calls()
  local calls = {}
  for _, call in ipairs(t.command_calls()) do
    if call.rendered:find(core.BOARD_FILENAME, 1, true) ~= nil
      or call.rendered:find(core.MANIFEST_FILENAME, 1, true) ~= nil then
      table.insert(calls, call)
    end
  end
  return calls
end

return {
  test_host_runner_test_affected_routes_package_only_changes = function()
    local source = file.read("scripts/run.sh")
    t.is_true(source:find("usage: scripts/run.sh <check|test|test-affected|supervise> [args]", 1, true) ~= nil)
    t.is_true(source:find("cmd_test_affected()", 1, true) ~= nil)
    t.is_true(source:find('git -C "$ROOT" diff --name-only HEAD', 1, true) ~= nil)
    t.is_true(source:find('git -C "$ROOT" ls-files --others --exclude-standard', 1, true) ~= nil)
    t.is_true(source:find("write_package_test_project()", 1, true) ~= nil)
    t.is_true(source:find('units = ["packages/*", "libraries/*"]', 1, true) ~= nil)
    t.is_true(source:find('packages = ["packages/*"]', 1, true) ~= nil)
    t.is_true(source:find('cp "$ROOT/scripts/run.sh" "$project_root/scripts/run.sh"', 1, true) ~= nil)
    t.is_true(source:find('"$BIN" test --project-root "$test_project" --package-root "$test_project/packages/$package"', 1, true) ~= nil)
    t.is_true(source:find("scripts/run.sh)\n      return 1", 1, true) ~= nil)
    t.is_true(source:find("scripts/*|site/*|.github/*|fkst.workspace.toml|fkst.lock|*.toml|*.lock|*.json|*.yml|*.yaml)", 1, true) ~= nil)
    t.is_true(source:find(".fkst/local-packages/*/*)", 1, true) ~= nil)
    t.is_true(source:find('package="${path#".fkst/local-packages/"}"', 1, true) ~= nil)
    t.is_true(source:find('cmd_test_package_only "$package"', 1, true) ~= nil)
    t.is_true(source:find("shared_host_run test", 1, true) ~= nil)
  end,

  test_persistence_class_is_stateless_adapter = function()
    t.eq(core.persistence_class(), "stateless_adapter")
  end,

  test_read_env_command_rejects_unknown_name = function()
    t.eq(core.read_env_command("FKST_GITHUB_REPO"), 'printf %s "$FKST_GITHUB_REPO"')
    t.eq(core.read_env_command("FKST_SITE_OUT"), 'printf %s "$FKST_SITE_OUT"')
    local ok = pcall(core.read_env_command, "PATH")
    t.eq(ok, false)
  end,

  test_site_out_defaults_to_build_data_and_rejects_site_tree = function()
    t.eq(core.site_out_dir(nil), "build/fkst/data")
    t.eq(core.site_out_dir("build/fkst/data/"), "build/fkst/data")
    t.eq(core.site_out_dir("./build/fkst/data"), "./build/fkst/data")
    local ok = pcall(core.site_out_dir, "site")
    t.eq(ok, false)
    ok = pcall(core.site_out_dir, "site/generated")
    t.eq(ok, false)
    ok = pcall(core.site_out_dir, "/repo/site/generated")
    t.eq(ok, false)
    ok = pcall(core.site_out_dir, "/repo/site")
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
    t.eq(
      core.gh_issue_body_cmd("owner/x", 53),
      "gh issue view 53 --repo 'owner/x' --json body"
    )
    local ok = pcall(core.gh_issue_list_cmd, "bad repo name")
    t.eq(ok, false)
    ok = pcall(core.gh_issue_body_cmd, "owner/x", "not-a-number")
    t.eq(ok, false)
  end,

  test_build_board_json_is_canonical_and_deterministic = function()
    local board = core.build_board_json("owner/x", ISSUES_JSON, PRS_JSON)
    t.is_true(board ~= nil)
    t.eq(board, EXPECTED_BOARD_JSON)
    local board_from_shuffled = core.build_board_json("owner/x", SHUFFLED_ISSUES_JSON, SHUFFLED_PRS_JSON)
    t.eq(board_from_shuffled, board)
    t.eq(board:find("generated_at", 1, true), nil)
    t.eq(board:find(tostring(now()), 1, true), nil)
    local decoded = json.decode(board)
    t.eq(decoded.schema_version, "fkst.site.board.v1")
    t.eq(decoded.repo, "owner/x")
    t.eq(decoded.issues[1].number, 1)
    t.eq(decoded.prs[1].number, 2)
    t.eq(decoded.merged_prs, nil)
  end,

  test_build_board_json_fails_closed_on_bad_input = function()
    local board, err = core.build_board_json("owner/x", "not json", PRS_JSON)
    t.eq(board, nil)
    t.is_true(err:find("issues", 1, true) ~= nil)
    board, err = core.build_board_json("owner/x", ISSUES_JSON, "{}")
    t.eq(board, nil)
    t.is_true(err:find("prs", 1, true) ~= nil)
    board, err = core.build_board_json("owner/x", ISSUES_JSON, '  {"message":"bad"}')
    t.eq(board, nil)
    t.is_true(err:find("prs", 1, true) ~= nil)
    board, err = core.build_board_json("owner/x", ISSUES_JSON, "  []\n")
    t.is_true(board ~= nil)
    board, err = core.build_board_json("owner/x", ISSUES_JSON, "")
    t.eq(board, nil)
    board, err = core.build_board_json("bad repo", ISSUES_JSON, PRS_JSON)
    t.eq(board, nil)
  end,

  test_queue_starvation_diagnosis_uses_existing_open_pr_snapshot = function()
    local numbers = core.queue_starvation_issue_numbers(STARVATION_ISSUES_JSON)
    t.eq(#numbers, 1)
    t.eq(numbers[1], 53)

    local fields = core.queue_starvation_diagnostic_fields(53, STARVATION_ISSUE_BODY_JSON, PRS_JSON)
    t.eq(
      table.concat(fields, " "),
      "issue=53 source=queue-starvation-watchdog incident_class=merge-ready-starvation head_issue=47 head_pr=2 diagnosis=head-pr-still-in-open-pr-snapshot repair_scope=queue-dlq affected_queues=consensus.consensus_reached,github-devloop-pr.devloop_merge_ready,github-devloop-pr.devloop_merge_queue_tick runbook=class-level-queue-dlq action=diagnose-only"
    )
  end,

  test_queue_starvation_diagnosis_surfaces_class_level_dlq_repair = function()
    local fields = core.queue_starvation_diagnostic_fields(70, STARVATION_DLQ_BODY_JSON, "[]")
    local line = table.concat(fields, " ")
    t.is_true(line:find("issue=70", 1, true) ~= nil)
    t.is_true(line:find("incident_class=merge-ready-starvation", 1, true) ~= nil)
    t.is_true(line:find("head_issue=68", 1, true) ~= nil)
    t.is_true(line:find("head_pr=69", 1, true) ~= nil)
    t.is_true(line:find("diagnosis=head-pr-not-in-open-pr-snapshot", 1, true) ~= nil)
    t.is_true(line:find("repair_scope=queue-dlq", 1, true) ~= nil)
    t.is_true(line:find("affected_queues=consensus.consensus_reached,github-devloop-pr.devloop_merge_ready,github-devloop-pr.devloop_merge_queue_tick", 1, true) ~= nil)
    t.is_true(line:find("runbook=class-level-queue-dlq", 1, true) ~= nil)
    t.is_true(line:find("head_source=observability-sample", 1, true) ~= nil)
    t.is_true(line:find("last_merge_age=3749", 1, true) ~= nil)
    t.is_true(line:find("action=diagnose-only", 1, true) ~= nil)
  end,

  test_manifest_lists_generated_docs_with_sha256 = function()
    local manifest = core.build_manifest_json(EXPECTED_BOARD_SHA256)
    local decoded = json.decode(manifest)
    t.eq(decoded.schema_version, "fkst.site.data.manifest.v1")
    t.eq(decoded.documents[1].path, "fkst.site.board.v1.json")
    t.eq(decoded.documents[1].schema_version, "fkst.site.board.v1")
    t.eq(decoded.documents[1].sha256, EXPECTED_BOARD_SHA256)
    t.eq(#decoded.documents[1].sha256, 64)
  end,

  test_sha256_uses_platform_command_and_parses_digest = function()
    local cmd = core.sha256_hex_cmd("abc")
    t.is_true(cmd:find("sha256sum", 1, true) ~= nil)
    t.is_true(cmd:find("shasum -a 256", 1, true) ~= nil)
    t.eq(
      core.parse_sha256_hex_output("BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD  -\n"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
    local digest, err = core.parse_sha256_hex_output("not-a-digest\n")
    t.eq(digest, nil)
    t.is_true(err:find("digest", 1, true) ~= nil or err:find("64 hex", 1, true) ~= nil)
  end,

  test_write_outputs_cmd_is_atomic_and_quoted = function()
    local manifest = core.build_manifest_json(EXPECTED_BOARD_SHA256)
    local cmd = core.write_outputs_cmd("/srv/build/fkst/data", EXPECTED_BOARD_JSON, manifest)
    t.is_true(cmd:find("mkdir -p '/srv/build/fkst/data'", 1, true) ~= nil)
    t.is_true(cmd:find("fkst.site.board.v1.json.tmp", 1, true) ~= nil)
    t.is_true(cmd:find("manifest.json.tmp", 1, true) ~= nil)
    t.is_true(
      cmd:find(
        "mv '/srv/build/fkst/data/fkst.site.board.v1.json.tmp' '/srv/build/fkst/data/fkst.site.board.v1.json'",
        1,
        true
      ) ~= nil
    )
    t.is_true(
      cmd:find("mv '/srv/build/fkst/data/manifest.json.tmp' '/srv/build/fkst/data/manifest.json'", 1, true) ~= nil
    )
    local ok = pcall(core.write_outputs_cmd, "site", EXPECTED_BOARD_JSON, manifest)
    t.eq(ok, false)
  end,

  test_scan_writes_default_data_outputs = function()
    mock_repo_env()
    mock_lists()
    mock_site_out_env("")
    mock_sha256()
    t.mock_command("mkdir -p", { stdout = "", exit_code = 0 })
    local result = run_scan(opts("default-data-out"))
    t.eq(result.exit_code, 0)
    t.eq(#result.raises, 0)
    local calls = publish_calls()
    t.eq(#calls, 1)
    t.is_true(calls[1].rendered:find("mkdir -p 'build/fkst/data'", 1, true) ~= nil)
    t.is_true(calls[1].rendered:find("fkst.site.board.v1.json", 1, true) ~= nil)
    t.is_true(calls[1].rendered:find("manifest.json", 1, true) ~= nil)
    t.is_true(calls[1].rendered:find(EXPECTED_BOARD_SHA256, 1, true) ~= nil)
    t.eq(calls[1].rendered:find("board.json", 1, true), nil)
  end,

  test_scan_logs_queue_starvation_diagnosis = function()
    mock_repo_env()
    mock_lists(STARVATION_ISSUES_JSON, PRS_JSON)
    t.mock_command("gh issue view 53 --repo 'owner/x' --json body", { stdout = STARVATION_ISSUE_BODY_JSON, exit_code = 0 })
    mock_site_out_env("")
    mock_sha256()
    t.mock_command("mkdir -p", { stdout = "", exit_code = 0 })
    local logs, result = capture_scan_logs(opts("starvation-diagnosis"))
    t.eq(result.exit_code, 0)
    local found = false
    for _, line in ipairs(logs) do
      if line:find("tag=QUEUE_STARVATION_DIAGNOSIS", 1, true) ~= nil then
        found = true
        t.is_true(line:find("issue=53", 1, true) ~= nil)
        t.is_true(line:find("incident_class=merge-ready-starvation", 1, true) ~= nil)
        t.is_true(line:find("head_issue=47", 1, true) ~= nil)
        t.is_true(line:find("head_pr=2", 1, true) ~= nil)
        t.is_true(line:find("diagnosis=head-pr-still-in-open-pr-snapshot", 1, true) ~= nil)
        t.is_true(line:find("repair_scope=queue-dlq", 1, true) ~= nil)
        t.is_true(line:find("affected_queues=consensus.consensus_reached,github-devloop-pr.devloop_merge_ready,github-devloop-pr.devloop_merge_queue_tick", 1, true) ~= nil)
        t.is_true(line:find("action=diagnose-only", 1, true) ~= nil)
      end
    end
    t.eq(found, true)
  end,

  test_scan_skips_without_repo_env = function()
    mock_repo_env("")
    local result = run_scan(opts("no-repo"))
    t.eq(result.exit_code, 0)
    t.eq(#publish_calls(), 0)
  end,

  test_scan_custom_site_out_writes_data_documents = function()
    mock_repo_env()
    mock_lists()
    mock_site_out_env("/tmp/site-data")
    mock_sha256()
    t.mock_command("mkdir -p", { stdout = "", exit_code = 0 })
    local result = run_scan(opts("custom-site-out"))
    t.eq(result.exit_code, 0)
    local calls = publish_calls()
    t.eq(#calls, 1)
    t.is_true(calls[1].rendered:find("fkst.site.board.v1", 1, true) ~= nil)
    t.is_true(
      calls[1].rendered:find(
        "mv '/tmp/site-data/fkst.site.board.v1.json.tmp' '/tmp/site-data/fkst.site.board.v1.json'",
        1,
        true
      ) ~= nil
    )
  end,

  test_scan_rejects_site_out_inside_site_tree = function()
    mock_repo_env()
    mock_lists()
    mock_site_out_env("site/generated")
    mock_sha256()
    local result = run_scan(opts("bad-site-out"))
    t.is_true(result.exit_code ~= 0)
    t.eq(#publish_calls(), 0)
  end,

  test_scan_errors_when_gh_fails = function()
    mock_repo_env()
    t.mock_command("gh issue list", { stdout = "", stderr = "boom", exit_code = 1 })
    t.mock_command("gh pr list --repo 'owner/x' --state open", { stdout = PRS_JSON, exit_code = 0 })
    local result = run_scan(opts("gh-fails"))
    t.is_true(result.exit_code ~= 0)
    t.eq(#publish_calls(), 0)
  end,
}
