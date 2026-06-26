local core = require("core")
local site = require("site")
local saga = require("workflow.saga")

local spec = {
  consumes = { "site_gen_generate" },
  ephemeral = { "site_gen_generate" },
  stall_window = "30s",
}

local function done(_event)
  return false
end

local function act(_event)
  local artifact_set = core.build_artifact_set(site)
  local config = core.default_output_config()
  local mkdir = exec_sync({ cmd = core.mkdir_outputs_cmd(config, artifact_set), timeout = 30 })
  if mkdir.exit_code ~= 0 then
    error("site generation mkdir failed: " .. tostring(mkdir.stderr))
  end
  for _, output in ipairs(artifact_set.files) do
    file.write(core.output_temp_path(output.path), output.content)
    local move = exec_sync({ cmd = core.move_output_cmd(output.path), timeout = 30 })
    if move.exit_code ~= 0 then
      error("site generation move failed: " .. tostring(move.stderr))
    end
  end

  log.info(
    "fkst-website dept=site_gen tag=OUTBOUND mode=eleventy-source generated_docs="
      .. tostring(#artifact_set.manifest_documents)
  )
end

return saga.department(spec, {
  done = done,
  act = act,
  name = "generate",
})
