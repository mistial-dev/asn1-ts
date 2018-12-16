const path = require('path');
module.exports = {
    entry: [
        "./source/index.ts"
    ],
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "asn1.js",
        library: "asn1",
        libraryTarget: "var"
    },
    mode: "development",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    optimization: {
        minimize: false
    },
    target: "web"
};