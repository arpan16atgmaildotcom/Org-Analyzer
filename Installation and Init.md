


# SF Org Analyzer - Installation & Setup Guide

Follow these steps to download, install, and run the **SF Org Analyzer** on your local machine.

## 1. Download and Navigate
1. Download the archive `sf-org-analyzer-v1.0.0.tar.gz` from the repository.
2. Navigate to the folder where the file was downloaded.
3. Open your terminal at that folder location.

## 2. Extract the Archive
Unzip and extract the contents of the tarball:
```bash
tar -xzf sf-org-analyzer-v1.0.0.tar.gz

```

Navigate into the extracted folder:

```bash
cd sf-org-analyzer-v1.0.0

```

## 3. Start the Local Server

To start the application, run the start script:

```bash
./start.sh

```

**OR** using npm:

```bash
npm run start

```

> ℹ️ **Note on First Launch:** The first launch installs server-only dependencies (takes approximately 10 seconds) and automatically opens [http://localhost:3001](https://www.google.com/search?q=http://localhost:3001). Subsequent launches are instantaneous. For advanced deployment configurations, please refer to the full **"Packaging a release for other users"** section in the `README`.

## 4. Stop the Local Server

To stop the local application server, run:

```bash
./stop.sh

```

**OR** using npm:

```bash
npm run stop

```

```

```