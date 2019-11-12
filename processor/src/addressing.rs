// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

use crypto::digest::Digest;
use crypto::sha2::Sha512;

const FAMILY_NAME: &str = "dgc_REST_api";
const PARTICIPANT: &str = "ae";
const PROPERTY: &str = "ea";
const PROPOSAL: &str = "aa";
const RECORD: &str = "ec";
const TABLE: &str = "ee";
const EXCHANGE: &str = "ce";

pub fn get_dgc_rest_api_prefix() -> String {
    let mut sha = Sha512::new();
    sha.input_str(&FAMILY_NAME);
    sha.result_str()[..6].to_string()
}

pub fn hash(to_hash: &str, num: usize) -> String {
    let mut sha = Sha512::new();
    sha.input_str(to_hash);
    let temp = sha.result_str().to_string();
    let hash = match temp.get(..num) {
        Some(x) => x,
        None => "",
    };
    hash.to_string()
}

pub fn make_participant_address(identifier: &str) -> String {
    get_dgc_rest_api_prefix() + &PARTICIPANT + &hash(identifier, 62)
}

pub fn make_record_address(record_id: &str) -> String {
    get_dgc_rest_api_prefix() + &RECORD + &hash(record_id, 62)
}

pub fn make_table_address(name: &str) -> String {
    get_dgc_rest_api_prefix() + &TABLE + &hash(name, 62)
}

pub fn make_property_address(record_id: &str, property_name: &str, page: u32) -> String {
    make_property_address_range(record_id) + &hash(property_name, 22) + &num_to_page_number(page)
}

pub fn make_property_address_range(record_id: &str) -> String {
    get_dgc_rest_api_prefix() + &PROPERTY + &hash(record_id, 36)
}

pub fn num_to_page_number(page: u32) -> String {
    format!("{:01$x}", page, 4)
}

pub fn make_proposal_address(proposal_id: &str) -> String {
    get_dgc_rest_api_prefix() + &PROPOSAL + &hash(proposal_id, 62)
}

pub fn make_exchange_address(buy_proposal_id: &str, sell_proposal_id: &str) -> String {
    get_dgc_rest_api_prefix() + &EXCHANGE + &hash(buy_proposal_id, 31) + &hash(sell_proposal_id, 31)
}
