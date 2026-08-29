const path = require("node:path");
const nodeExternals = require("webpack-node-externals");
const { TsconfigPathsPlugin } = require("tsconfig-paths-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

/**
 * Nest builds through webpack so that the `@src/*` path aliases are resolved at
 * BUILD time. With a plain `tsc` build the aliases survive into `dist/` and the
 * app crashes at runtime with "Cannot find module '@src/config'".
 *
 * `keep_classnames` / `keep_fnames` are mandatory: Nest's DI, GraphQL code-first
 * and class-validator all read class names through reflection. Minifying them
 * away breaks the container in production only — the exact bug you never catch
 * locally.
 */
module.exports = (options, _) => {
	const isProduction = process.env.NODE_ENV === "production";

	return {
		...options,
		mode: isProduction ? "production" : "development",
		devtool: "source-map",
		externals: [nodeExternals({ allowlist: [] })],
		output: {
			...options.output,
			path: path.resolve(__dirname, "dist"),
			filename: "[name].js",
			sourceMapFilename: "[name].js.map",
		},
		resolve: {
			...options.resolve,
			alias: {
				...options.resolve?.alias,
				"@app": path.resolve(__dirname, "src/app"),
				"@utils": path.resolve(__dirname, "src/utils"),
				"@config": path.resolve(__dirname, "src/config"),
				"@modules": path.resolve(__dirname, "src/modules"),
				"@src": path.resolve(__dirname, "src"),
				"@libs": path.resolve(__dirname, "src/libs"),
			},
			plugins: [new TsconfigPathsPlugin({ configFile: "./tsconfig.json" })],
		},
		optimization: {
			minimize: isProduction,
			minimizer: [
				new TerserPlugin({
					terserOptions: { keep_classnames: true, keep_fnames: true },
				}),
			],
		},
	};
};
