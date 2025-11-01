# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/a087aa7f-0d83-445e-ae56-08153c41bbcf

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/a087aa7f-0d83-445e-ae56-08153c41bbcf) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Electron (for desktop app)

## Running as Electron Desktop App

This project can run as a desktop application using Electron.

### Development Mode

To run the app in Electron development mode:

```sh
npm run dev:electron
```

This will:
1. Start the Vite dev server on http://localhost:8080
2. Wait for the server to be ready
3. Launch Electron with hot-reload support

### Building for Production

To build the Electron app for distribution:

```sh
# Build the app (creates distributable packages)
npm run electron:dist

# Or build without packaging
npm run build:electron
```

The built applications will be in the `release` directory:
- **macOS**: `.dmg` file
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` file

### Available Scripts

- `npm run dev:electron` - Run in Electron development mode
- `npm run build:electron` - Build the React app and Electron main process
- `npm run electron:dist` - Build and package for distribution
- `npm run electron:pack` - Build and create distributable packages

## How can I deploy this project?

For web deployment, simply open [Lovable](https://lovable.dev/projects/a087aa7f-0d83-445e-ae56-08153c41bbcf) and click on Share -> Publish.

For desktop distribution, use `npm run electron:dist` and distribute the files from the `release` directory.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
