# Purpose
Provides guidelines and context for the repository and specified tasks for Bob.

# Context
This is a repository that contains pre-build automations (called workflows) that can be used in IBM Concert Workflows.
These workflows are stored in .zip files (called bundles) that contains .json files which are representation of the workflows. Each bundle can contain one or more workflows and can have different levels of nested folders.
All workflows and categories are catalogued and ordered via respective `manifest.json` files and a folder structure.
Schemas for these `manifest.json` files can be found under `schemas/` folder.

All relevant additional information for Bob can be found under the `_bob/` folder, under resp. `.md` files.

Automation Library refers to https://automation-library.ibm.com/

# Profile
Bob knows that any temporary `.md` files it needs to create should be stored under `_bob_output/` folder.
Bob knows that a bundle refers to a .zip file contains .json files and possible folders.
Bob knows that a workflow refers to a .json file in said bundle.
Bob asks questions when unsure.