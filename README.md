<p align="center">
  <img src="resources/images/ghostwriter_logo.png" alt="Ghostwriter" width="600" />
</p>

<p align="center">Plan your story visually.</p>

Ghostwriter is an Electron desktop writing app built around a visual story board.
Organize your story into Arcs, Beats, References and Notes, assemble chapter plans, and write or generate drafts before publishing them to your manuscript. Projects are saved as local files. AI generation is optional, but is the main feature of Ghostwriter.

The project is under active development. Run it from source using the instructions below.

## Getting started

Linux (Debian/Ubuntu/Kubuntu) is fully supported, but Ghostwriter should work anywhere you can run Node and Electron, including MacOS and Windows.

You need Node.js, npm, and a graphical desktop environment. NVM is recommended to keep Node updated. From the project directory:

```bash
npm install
npm start
```

Choose **New Project** to start with an empty project, open an existing `.ghostwriter`
file, or choose the included **Tutorial** template to explore the workflow.
You can plan and write without configuring an AI provider.

## Build your story board

Drag elements from the right-hand tray onto the canvas:


| Element         | Purpose                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| **Arc**         | A story thread or sequence containing Beats and chapters.                    |
| **Beat**        | A story event. Drop it into an Arc, then reorder it or move it between Arcs. |
| **Reference**   | Character details, setting notes, or other context to attach to an Arc.      |
| **Container**   | A visual grouping for related canvas elements.                               |
| **Sticky note** | A quick note on the board.                                                   |

Connect compatible ports by dragging between them. The **Source Arc**, marked
with a star, starts the connected story sequence. Use an Arc's context menu to
change the source. The **Dictionary** panel helps you navigate Arcs, chapters,
and Beats; the **Story** panel displays published chapter content.

## Plan, draft, and publish

1. Choose **Write Chapters…** on an Arc to open Chapter Studio.
2. Create a chapter. Click or drag Beats into its Plan and type directions between them.
3. Attach any References connected to the Arc that the chapter needs.
4. Write directly in **Draft → Edit Markdown**, or configure generation and choose **Generate Draft**.
5. Review the draft, then select **Use draft in Story** to publish it to the manuscript.

A Beat can be assigned to one chapter within its Arc. Studio asks before transferring
it to another chapter. Removing a Beat block from a plan releases the assignment
without deleting the Beat from the Arc.

Generation uses the selected model, requested minimum word count, chapter plan,
attached References, and project Style Guide. Optional previous/next Arc context
helps guide chapter boundaries. These are instructions to the model, not guarantees
about its output; review the result before publishing. Generation can be canceled,
and regenerating a draft keeps the previous draft in history.

### Markdown and reading

Chapter bodies are stored as Markdown source. Use the **Preview / Edit Markdown**
switch in Draft to alternate between formatted prose and the editable source.
The popup Reader also renders Markdown. The regular Story panel and other text
views display the raw source.

Supported formatting includes italics, bold, headings, lists, blockquotes, and
scene breaks. Raw HTML is displayed as text, links are inert, and images show
their alt text without loading local or remote files. This is done for security
reasons.

### Project Style Guide

Open **Dictionary → Style Guide** to write project-wide instructions for voice,
tone, formatting, and storytelling. You can also import a UTF-8 `.txt` or `.md`
file; importing replaces the current guide after confirmation. The guide is
saved with the project and included in each chapter-generation request.

## Save projects and backups

Use the **File** menu:


| Action               | Behavior                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| **Save**             | Writes to the existing filename, or opens Save As for a new project.       |
| **Save As…**        | Chooses a new filename and destination for subsequent saves.               |
| **Save as Template** | Saves a reusable copy under`Ghostwriter/Templates` in your home directory. |
| **Load…**           | Opens a`.ghostwriter` project.                                             |

Changing a project title does not rename its file. The window title shows
`*Unsaved` while the project differs from the last manual save.

Autosave writes a separate backup beside the project: `my-story.ghostwriter.bak`.
It does **not** overwrite `my-story.ghostwriter` or clear the unsaved marker.
A new project or template copy needs an initial manual Save to establish a destination.

To recover a backup, copy it to a new filename ending in `.ghostwriter` and open
that copy. The app currently does not automatically offer backup recovery on Open;
recover the backup before continuing to edit the older primary file, since later
autosaves replace the backup. Use manual Save before closing when you want your
latest work in the primary project file.

## Export the manuscript

Choose **Export** in the top bar, select a format, and choose **Save story…**.
The popup closes after a successful export.

Exports include nonempty published chapters in Story order. Plans, References,
Style Guide instructions, and unaccepted drafts are excluded.


| Format                   | Output                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| **Markdown — `.md`**    | Chapter headings and the original Markdown body.                   |
| **Plain text — `.txt`** | Titles and chapter source as text, including Markdown punctuation. |
| **HTML — `.html`**      | A standalone page with rendered Markdown and escaped raw HTML.     |
| **Rich text — `.rtf`**  | Formatted prose with bold, italics, headings, lists, blockquotes, and code. |

Exporting a manuscript does not save the editable project or clear `*Unsaved`.

RTF exports turn scene breaks into centered `* * *` markers and tables into
tab-separated rows. Links remain readable text and images become alt text;
no external resources are embedded.

## Configure AI generation

Provider settings live in [`llm-models.json`](llm-models.json). Use
**Reload model configuration** in Chapter Studio after editing that file.
The included entries cover Responses and OpenAI-compatible Chat Completions
endpoints, with examples for OpenAI, LM Studio, Azure, and a custom provider.


| Field      | Meaning                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `id`       | Unique local identifier used to select the model.                         |
| `label`    | Display name in Chapter Studio.                                           |
| `model`    | Provider model ID or deployment name.                                     |
| `api`      | `responses` or `chat`.                                                    |
| `endpoint` | Full request URL, including the API path and required query parameters.   |
| `auth`     | `bearer`, `api-key`, or `none`.                                           |
| `keyEnv`   | Environment variable containing the provider's credential, when required. |

The top-level `defaultModel` selects the initial model. `defaultPrompt` supplies
the default generation instructions; `{word_count}` is replaced with the chapter's
requested minimum word count.

For authenticated providers, set the configured environment variable in the
environment that launches Ghostwriter. The included entries use `OPENAI_API_KEY`,
`AZURE_OPENAI_API_KEY`, and `CUSTOM_LLM_API_KEY`. Do not put credentials in project
files or `llm-models.json`.

For **LM Studio**, start its local server and replace `local-model` with the loaded
model's identifier. The example uses `http://localhost:1234/v1/chat/completions`
with no authentication. For **Azure** and **custom providers**, replace the
placeholder resource, deployment, or model values and configure the full endpoint.
Use HTTPS for remote providers. Model availability and usage charges depend on
your provider and account; included model IDs are configuration, not a guarantee
of access.

### Data and network behavior

Credentials and generation requests are handled in Electron's main process.
Choosing **Generate Draft** sends the plan, selected Reference text, Style Guide,
instructions, and any enabled adjacent-Arc context to the configured provider.
Provider retention and privacy policies still apply.

When `OPENAI_API_KEY` is present, the launch screen makes a models-list request
to check it; this is not a chapter-generation request. The interface also loads
fonts from Google Fonts. Local project storage does not imply that the app makes
no network requests.

## Development

```bash
npm run dev
```

Development mode reloads the window when watched frontend files change, including
the HTML, styles, renderer, Markdown wrapper, Studio, Style Guide, and preload.
Changes to `main.js` or its helper modules require a full app restart.

### Checks

Run the unit tests:

```bash
node --test tests/*.test.js
```

On Linux, with `xvfb-run` installed, run the Electron smoke tests:

```bash
env -u ELECTRON_RUN_AS_NODE xvfb-run -a node_modules/.bin/electron tests/studio-smoke.cjs --no-sandbox
env -u ELECTRON_RUN_AS_NODE xvfb-run -a node_modules/.bin/electron tests/save-smoke.cjs --no-sandbox
```

The smoke commands disable Chromium's sandbox for the test environment only.
They use mocked generation or temporary project files and make no paid generation
requests. The Save smoke test mocks the native picker, so it does not establish
that every desktop's interactive save dialog behaves correctly.

For dependency advisories, run `npm audit`. Include development dependencies:
Electron is declared there but is also the application's runtime.

### Linux save dialogs

Ghostwriter currently bypasses portal file pickers on Linux because some desktop
setups returned cancellation after the user clicked Save. The fallback picker
may look different from the desktop's usual file explorer. This workaround does
not apply on Windows or macOS. Save diagnostics appear in the terminal that
launched the app.

## License

Released into the public domain under the [Unlicense](LICENSE).
