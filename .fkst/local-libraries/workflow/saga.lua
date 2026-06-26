local S = {}

local function accept_all(_event)
  return true
end

local function validate_spec(spec)
  if type(spec) ~= "table" or type(spec.consumes) ~= "table" or #spec.consumes == 0 then
    error("workflow.saga: department requires a non-empty consumes spec")
  end
end

local function validate_handlers(handlers)
  if type(handlers) ~= "table" or type(handlers.done) ~= "function" or type(handlers.act) ~= "function" then
    error("workflow.saga: department requires done and act handlers")
  end
end

local function exposed_spec(spec)
  return {
    consumes = spec.consumes,
    produces = spec.produces,
    stall_window = spec.stall_window,
    retry = spec.retry,
    fanout = spec.fanout,
    ephemeral = spec.ephemeral,
    published_seam = spec.published_seam,
  }
end

function S.department(spec, handlers)
  validate_spec(spec)
  validate_handlers(handlers)

  local accept = handlers.accept or accept_all
  local function pipeline(event)
    if not accept(event) then
      if type(handlers.on_skip_foreign) == "function" then
        handlers.on_skip_foreign(event)
      end
      return nil
    end
    if handlers.done(event) then
      if type(handlers.on_skip) == "function" then
        handlers.on_skip(event)
      end
      return nil
    end
    return handlers.act(event)
  end

  _G.pipeline = pipeline
  return {
    spec = exposed_spec(spec),
    pipeline = pipeline,
  }
end

return S
