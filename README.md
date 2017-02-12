λab
===

λab (a.k.a. LambdaLab) is an interactive λ-calculus interpreter for learning.


Setting Up
----------

λab is written in [TypeScript][] and has a command-line interface and a [Web-based visual interface][web]. To get started with both, you'll need [Node][]. First, clone the repository. Then you'll need to compile the source to JavaScript.

You can get the TypeScript compiler and other dependencies from `npm` by typing `npm install` or just [`yarn`][yarn] if you have that.

### Web Interface

To build the Web interface, type `npm run build-web` or `yarn run build-web`. This will create a [webpack][]ed JavaScript bundle called `lambdalab.bundle.js`. Open the `index.html` file in your browser.

The main `<script>` for the Web interface is `lambdalab.ts`.

### Command-Line Script

To build the command-line version, type `npm run build-cli` or `yarn run build-cli`. Use `node build/lc.js` to run the script directly. Or type `npm link` or `yarn link` to symlink an `lc` executable; then, as long as the right directory is on your `$PATH`, you can just type `lc`.

The main entry point for the CLI tool is `lc.ts`.

### Running the Tests

Use `yarn test` or `npm test` to build the source for the tests and run them.

[webpack]: https://webpack.github.io
[TypeScript]: https://www.typescriptlang.org
[yarn]: https://yarnpkg.com/en/
[node]: https://nodejs.org/en/
[web]: https://capra.cs.cornell.edu/lambdalab/
