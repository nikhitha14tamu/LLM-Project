# Python Migrator Extension

## Overview
This extension automates the migration of Python 2 code to Python 3, leveraging AI-powered tools for precise and reliable conversions.

## Features
- **File Scanning**: Recursively scans directories for `.py` files.
- **Dependency-Aware Chunking**: Handles large files by chunking them logically.
- **LLM Integration**: Utilizes advanced AI models to translate code with high accuracy.
- **Validation and Reporting**: Ensures migrated code adheres to modern standards with detailed reports.

## How to Use
1. Install the extension.
2. Open a Python 2 codebase in VS Code.
3. Run the migration command via the Command Palette.

## Requirements
- Python 3.1 or higher installed on your system.
- `mypy` and other dependencies installed.

## Configuration
To use the Python Migrator extension, you need an OpenAI API key. This key is stored securely in a `.env` file in your workspace directory.

### Steps to Configure
1. **Create a `.env` File**:
   - In the root directory of your workspace, create a file named `.env`.
   - Add the following line to the file:
     ```
     OPENAI_API_KEY=your-api-key-here
     ```

   Replace `your-api-key-here` with your actual OpenAI API key. You can obtain an API key from [OpenAI](https://platform.openai.com/).

2. **Install Dependencies**:
   - Ensure the `dotenv` package is installed in the extension's development environment. This is already included in the extension.

3. **Run the Extension**:
   - Open your Python 2 project in VS Code.
   - The extension will automatically read the API key from the `.env` file in your workspace directory.
   - Use the Command Palette (`Ctrl + Shift + P`) to run the migration commands.

## Troubleshooting
- If the extension cannot find the API key, ensure the `.env` file is in the root directory of your workspace and the key is correctly formatted.
- Make sure the `.env` file is excluded from version control by adding it to `.gitignore`:
  ```
  .env
  ```

## Example
Here’s an example `.env` file:
```
OPENAI_API_KEY=sk-abcdefg123456789
```

With this setup, the Python Migrator extension will use the specified API key to perform migrations seamlessly.

---

This updated configuration ensures that sensitive keys are kept out of source code and managed securely. Let me know if you need further assistance!