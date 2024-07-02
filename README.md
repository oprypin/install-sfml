Install SFML
============

[![Main](https://github.com/oprypin/install-sfml/actions/workflows/main.yml/badge.svg)](https://github.com/oprypin/install-sfml/actions/workflows/main.yml)
[![Release](https://github.com/oprypin/install-sfml/actions/workflows/release.yml/badge.svg)](https://github.com/oprypin/install-sfml/actions/workflows/release.yml)

This GitHub action downloads & builds SFML libraries in your workflow run.

* Downloads a distribution of the specified SFML version and unpacks it.
* Builds the required libraries

Use it in your workflow like this:

    - name: Install SFML
      id: sfml
      uses: oprypin/install-sfml@v1
      with:
        sfml: 2.6.1
        config: Release

    - name: Show paths
      run: |
        printf 'SFML %s has been installed\n' '${{ steps.sfml.outputs.sfml }}'
        printf 'Include directories can be found here: %s\n' '${{ steps.sfml.outputs.path }}/include'
        printf 'Libraries can be found here: %s\n' '${{ steps.sfml.outputs.path }}/lib'
      shell: bash

* `Release` is the default value for the `config` parameter and can be
omitted.
Use `Debug` if you want to build debug binaries.

API
---

| Input          | Value            | Default | Description
| -------------- | ---------------- | ------- | ----------------------------
| sfml           | `latest`         | ✓       | SFML version to build, or  
|                | `nightly`        |         | `package` to install from a 
|                | `package`        |         | package manager on Mac or 
|                | `2.6.1` or other |         | Linux
| config         | Release          | ✓       | Build Release binaries.
|                | Debug            |         | Build Debug binaries.

Caching
-------

This action automatically handles caching when installing SFML from source.

License
-------

Distributed under the MIT License.
See [LICENSE.md] for details.

[LICENSE.md]: LICENSE.md
