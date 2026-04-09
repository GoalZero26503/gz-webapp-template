# Adding Features

This guide explains how to build new features for your webapp using Claude Code. You do not need to be an expert programmer; Claude Code handles the implementation details. Your job is to describe what you want clearly.

## How to Describe What You Want

The better your description, the better the result. Here are some tips:

**Be specific about what the user sees:**
- Good: "A page that shows a table of all devices with columns for serial number, firmware version, and last seen date"
- Vague: "A device page"

**Give examples of the data:**
- Good: "Each device has a serial number like 'YT6-MD-00001', a firmware version like '1.2.3', and a status that is either 'online' or 'offline'"
- Vague: "Show device info"

**Describe the interactions:**
- Good: "Clicking a device row should open a detail panel on the right side showing all device properties. There should be a button to force an OTA update."
- Vague: "Users should be able to view devices"

**Mention access control if needed:**
- Good: "Only admins should be able to delete devices. Regular users can view but not modify."

## Using /gz:webapp:scaffold

The scaffold command is the fastest way to add features. It creates all the files you need across the frontend, backend, and infrastructure.

In Claude Code, type:

```
/gz:webapp:scaffold a page that shows a table of devices with serial number, firmware version, and status columns. Admins can add and delete devices.
```

The scaffold command will:
1. Figure out what files need to be created (page, API routes, database table, etc.)
2. Show you a plan and ask for confirmation
3. Create all the files
4. Update existing files (routes, navigation, etc.)
5. Run a typecheck to make sure everything compiles

## Testing Locally

After scaffolding or making changes, test them locally before deploying:

```bash
cd webapp && npm run dev
```

This starts a local server at [http://localhost:5174](http://localhost:5174). The page auto-refreshes when you save changes.

Note: Local development uses Vite's proxy to forward API calls. If you need the backend running too, you will need to deploy to dev first so the API endpoints exist.

## Reviewing Changes

Before deploying, it is a good idea to review what was created or changed:

```bash
git diff
```

This shows all modifications. Look for:
- New files that were created
- Changes to existing files (routes added, imports added, etc.)
- Nothing that looks obviously wrong

You can also ask Claude Code to explain the changes:

```
What did you just create? Explain each file.
```

## Deploying

Once you are happy with the changes locally:

```
/gz:webapp:deploy dev
```

This deploys to the dev environment. Test it there by visiting the dev URL in your browser.

When everything works in dev, deploy to production:

```
/gz:webapp:deploy prod
```

## Tips for Working with Claude Code

**Iterate in small steps.** Instead of asking for a complex feature all at once, build it piece by piece:
1. Start with the basic page and data display
2. Add filtering and sorting
3. Add create/edit functionality
4. Add delete with confirmation
5. Polish the UI

**Test each change.** After each step, run the app locally or deploy to dev and verify it works before moving on.

**Commit working code.** After each successful step, save your progress:
```bash
git add -A
git commit -m "Add device list page with basic table"
```

This way, if something goes wrong later, you can always go back to a working state.

**Ask Claude to fix errors.** If something breaks, paste the error message into Claude Code and ask it to fix it. Claude Code can read the error, find the problem, and apply the fix.

**Use natural language.** You do not need to know React, TypeScript, or AWS to build features. Just describe what you want in plain English and let Claude Code handle the technical details.

## Common Feature Patterns

Here are descriptions you can adapt for common features:

**Data table with CRUD:**
```
A page for managing [items]. Show a table with [column1], [column2], [column3]. 
Admins can add new [items] with a form and delete existing ones. 
Store the data in DynamoDB.
```

**Dashboard with stats:**
```
A dashboard page that shows summary cards: total [items], [items] by status, 
and [items] added this week. Pull the data from the [items] API.
```

**Detail view:**
```
When clicking a row in the [items] table, navigate to /[items]/{id} which shows 
all the properties in a detail layout with a back button.
```

**File upload:**
```
Add a file upload button to the [item] detail page that uploads files to S3 
and stores the S3 key in the [item] record.
```
