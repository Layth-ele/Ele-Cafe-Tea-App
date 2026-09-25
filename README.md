
    # Ele Cafe (Tea & Coffee) E-Commerce App

    ## Onboarding

    1. **Clone the repository**
      ```sh
      git clone <your-repo-url>
      cd ele-cafe
      ```

    2. **Install dependencies** (pnpm preferred, or npm)
      ```sh
      pnpm install
      # or
      npm install
      ```

    3. **Start the development server**
      ```sh
      npm run dev
      ```

    4. **Firebase setup**
      - Make sure you have the Firebase CLI installed and configured.
      - See `DEPLOY.md` for deployment and emulator instructions.

    ## Scripts Usage

    ### Seeding Data
    - To seed the database with mock data, use one of the following:
     - Node.js script: `scripts/seed.jsx`
     - TypeScript/React script: `src/scripts/seedEverything.tsx`

    #### Example (Node.js):
    ```sh
    node scripts/seed.jsx
    ```

    #### Example (TypeScript):
    ```sh
    pnpm tsx src/scripts/seedEverything.tsx
    ```

    ## Additional Documentation
    - See `DEPLOY.md` for deployment steps.
    - See `src/schemas/README.md` for schema/validation info.
    - See `src/styles/README.md` for custom CSS system details.

    ## Running the code

    Run `npm i` to install the dependencies.

    Run `npm run dev` to start the development server.
  