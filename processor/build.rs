// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

extern crate glob;
extern crate protoc_rust;

use std::fs;
use std::io::Write;
use protoc_rust::Customize;

fn main() {
    // Generate protobuf files
    let proto_src_files = glob_simple("../protos/*.proto");
    println!("{:?}", proto_src_files);

    fs::create_dir_all("src/messages").unwrap();

    protoc_rust::run(protoc_rust::Args {
        out_dir: "src/messages",
        input: &proto_src_files
            .iter()
            .map(|a| a.as_ref())
            .collect::<Vec<&str>>(),
        includes: &["src", "../protos"],
        customize: Customize::default(),
    }).expect("unable to run protoc");

    let mut file = fs::File::create("src/messages/mod.rs").unwrap();
    for filename in proto_src_files.iter() {
        file.write_all(path_to_mod(&filename).as_bytes()).unwrap();
    }
}

fn path_to_mod(filename: &String) -> String {
    filename.replace("../protos/", "pub mod ").replace(".proto", ";\n")
}

fn glob_simple(pattern: &str) -> Vec<String> {
    glob::glob(pattern)
        .expect("glob")
        .map(|g| {
            g.expect("item")
                .as_path()
                .to_str()
                .expect("utf-8")
                .to_owned()
        })
        .collect()
}
