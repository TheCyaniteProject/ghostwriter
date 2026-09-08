# Ghostwriter

## Chapter Studio and generation

Choose **Write Chapters…** at the bottom of an Arc or in its context menu.
Create a chapter, then drag (or click) Beats into its Plan and type directions
between the blocks. A Beat can belong to only one chapter; transferring it asks
for confirmation. Removing a block releases the Beat without deleting it.

Choose attached Arc References, a model, minimum word count, and optional custom
generation instructions. **Generate Draft** creates a separate draft. Review or
edit it and select **Use draft in Story** to publish it to Story and the reader.
Regeneration keeps the previous draft in the history menu. Plans, assignments,
instructions, reference selections, and drafts are included in project saves.

### Models and credentials

The **Style Guide** button at the top of Dictionary opens the project-wide
writing guide. Edit it directly or import a UTF-8 `.txt`/`.md` file. Importing
replaces the guide after confirmation. The guide is saved with the project and
sent with every chapter generation, alongside its plan and attachments.

Edit `llm-models.json` in the project directory. The Studio's **Reload model
configuration** button picks up changes without restarting. Each model entry has:

- `id`: unique local selection ID; `label`: display name; `model`: provider model ID or Azure deployment name.
- `api`: `responses` or `chat` (OpenAI-compatible Chat Completions).
- `endpoint`: full request URL, including the API path and any required query parameters.
- `auth`: `bearer`, `api-key`, or `none`.
- `keyEnv`: environment variable containing that provider's secret, when authentication is required.

OpenAI entries include `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, and
`gpt-6-astra`. Set `OPENAI_API_KEY` in the environment that launches Electron.
Model access and quota depend on your OpenAI account. Launch checks use the
models endpoint, not a paid generation request. Missing keys, rejected keys,
and connectivity/access errors are distinguished on the launch screen.

For LM Studio, start its local server and replace `local-model` with the loaded
model's identifier. The default endpoint is
`http://localhost:1234/v1/chat/completions`, with no authentication. If your
server requires authentication, configure a separate key environment variable.

For Azure, replace `YOUR_RESOURCE` and `YOUR_DEPLOYMENT_NAME` and set
`AZURE_OPENAI_API_KEY`. The example uses Azure's `/openai/v1/chat/completions`
endpoint with `api-key` authentication. A legacy deployment endpoint can be
used by supplying its complete URL, including `api-version`.

The custom entry supports other providers exposing either supported wire
format. Set its endpoint, model, auth scheme, and `CUSTOM_LLM_API_KEY` as needed.
Arbitrary proprietary API formats require an additional adapter. Never put
API keys in the JSON file or project files. Keys and requests stay in Electron's
main process; generation sends the selected plan and attached reference text
to the configured endpoint only when Generate Draft is clicked.

Useful provider references:
[OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model),
[LM Studio compatibility](https://lmstudio.ai/docs/developer/openai-compat), and
[Azure API reference](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/chat).

### Checks

`node --test tests/llm.test.js` tests provider adapters with mocked responses.
`env -u ELECTRON_RUN_AS_NODE xvfb-run -a node_modules/.bin/electron tests/studio-smoke.cjs --no-sandbox`
runs the Linux headless Studio smoke test. These tests make no paid API calls.

A front-end Electron prototype for visually arranging story arcs, beats, and references.

## Run

```bash
npm install
npm start
```

For development, launch the app with automatic front-end reloading:

```bash
npm run dev
```

Changes to `index.html`, `styles.css`, `renderer.js`, and `preload.js` reload the Electron window automatically.

Drag Arc and Reference cards from the right tray onto the board. Drag from output ports to compatible Arc input ports to connect nodes. Beats can be dropped into an Arc, reordered within it, or moved between Arcs.
