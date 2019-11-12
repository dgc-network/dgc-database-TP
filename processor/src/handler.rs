// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

use protobuf;
use protobuf::Message;
use protobuf::RepeatedField;

use std::collections::HashMap;

use sawtooth_sdk::processor::handler::ApplyError;
use sawtooth_sdk::processor::handler::TransactionContext;
use sawtooth_sdk::processor::handler::TransactionHandler;
use sawtooth_sdk::messages::processor::TpProcessRequest;

use messages::*;
use addressing::*;

const PROPERTY_PAGE_MAX_LENGTH: usize = 256;

#[derive(Debug, Clone)]
enum Action {
    CreateParticipant(payload::CreateParticipantAction),
    CreateRecord(payload::CreateRecordAction),
    FinalizeRecord(payload::FinalizeRecordAction),
    CreateTable(payload::CreateTableAction),
    UpdateProperties(payload::UpdatePropertiesAction),
    CreateProposal(payload::CreateProposalAction),
    AnswerProposal(payload::AnswerProposalAction),
    RevokeReporter(payload::RevokeReporterAction),
}

struct PayloadDGC {
    action: Action,
    timestamp: u64,
}

impl PayloadDGC {
    pub fn new(payload: &[u8]) -> Result<Option<PayloadDGC>, ApplyError> {
        let payload: payload::PayloadDGC = match protobuf::parse_from_bytes(payload) {
            Ok(payload) => payload,
            Err(_) => {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "Cannot deserialize payload",
                )))
            }
        };

        let dgc_rest_api_action = payload.get_action();
        let action = match dgc_rest_api_action {
            payload::PayloadDGC_Action::CREATE_PARTICIPANT => {
                let create_participant = payload.get_create_participant();
                if create_participant.get_name() == "" {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Participant name cannot be an empty string",
                    )));
                }
                Action::CreateParticipant(create_participant.clone())
            }
            payload::PayloadDGC_Action::CREATE_RECORD => {
                let create_record = payload.get_create_record();
                if create_record.get_record_id() == "" {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Record id cannot be empty string",
                    )));
                }
                Action::CreateRecord(create_record.clone())
            }
            payload::PayloadDGC_Action::FINALIZE_RECORD => {
                Action::FinalizeRecord(payload.get_finalize_record().clone())
            }
            payload::PayloadDGC_Action::CREATE_TABLE => {
                let create_table = payload.get_create_table();
                if create_table.get_name() == "" {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Table name cannot be an empty string",
                    )));
                };
                let properties = create_table.get_properties();
                if properties.len() == 0 {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Table must have at least one property",
                    )));
                }
                for prop in properties {
                    if prop.name == "" {
                        return Err(ApplyError::InvalidTransaction(String::from(
                            "Property name cannot be an empty string",
                        )));
                    }
                }

                Action::CreateTable(create_table.clone())
            }
            payload::PayloadDGC_Action::UPDATE_PROPERTIES => {
                Action::UpdateProperties(payload.get_update_properties().clone())
            }
            payload::PayloadDGC_Action::CREATE_PROPOSAL => {
                Action::CreateProposal(payload.get_create_proposal().clone())
            }
            payload::PayloadDGC_Action::ANSWER_PROPOSAL => {
                Action::AnswerProposal(payload.get_answer_proposal().clone())
            }
            payload::PayloadDGC_Action::REVOKE_REPORTER => {
                Action::RevokeReporter(payload.get_revoke_reporter().clone())
            }
        };
        let timestamp = match payload.get_timestamp() {
            0 => {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "Timestamp is not set",
                )))
            }
            x => x,
        };

        Ok(Some(PayloadDGC {
            action: action,
            timestamp: timestamp,
        }))
    }

    pub fn get_action(&self) -> Action {
        self.action.clone()
    }

    pub fn get_timestamp(&self) -> u64 {
        self.timestamp
    }
}

pub struct StateDGC<'a> {
    context: &'a mut TransactionContext,
}

impl<'a> StateDGC<'a> {
    pub fn new(context: &'a mut TransactionContext) -> StateDGC {
        StateDGC { context: context }
    }

    pub fn get_record(&mut self, record_id: &str) -> Result<Option<record::Record>, ApplyError> {
        let address = make_record_address(record_id);
        let d = self.context.get_state(vec![address])?;
        match d {
            Some(packed) => {
                let records: record::RecordContainer =
                    match protobuf::parse_from_bytes(packed.as_slice()) {
                        Ok(records) => records,
                        Err(_) => {
                            return Err(ApplyError::InternalError(String::from(
                                "Cannot deserialize record container",
                            )))
                        }
                    };

                for record in records.get_entries() {
                    if record.record_id == record_id {
                        return Ok(Some(record.clone()));
                    }
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub fn set_record(
        &mut self,
        record_id: &str,
        record: record::Record,
    ) -> Result<(), ApplyError> {
        let address = make_record_address(record_id);
        let d = self.context.get_state(vec![address.clone()])?;
        let mut record_container = match d {
            Some(packed) => match protobuf::parse_from_bytes(packed.as_slice()) {
                Ok(records) => records,
                Err(_) => {
                    return Err(ApplyError::InternalError(String::from(
                        "Cannot deserialize record container",
                    )))
                }
            },
            None => record::RecordContainer::new(),
        };
        // remove old record if it exists and sort the records by record id
        let records = record_container.get_entries().to_vec();
        let mut index = None;
        let mut count = 0;
        for record in records.clone() {
            if record.record_id == record_id {
                index = Some(count);
                break;
            }
            count = count + 1;
        }

        match index {
            Some(x) => {
                record_container.entries.remove(x);
            }
            None => (),
        };
        record_container.entries.push(record);
        record_container.entries.sort_by_key(|r| r.clone().record_id);
        let serialized = match record_container.write_to_bytes() {
            Ok(serialized) => serialized,
            Err(_) => {
                return Err(ApplyError::InternalError(String::from(
                    "Cannot serialize record container",
                )))
            }
        };
        let mut sets = HashMap::new();
        sets.insert(address, serialized);
        self.context
            .set_state(sets)
            .map_err(|err| ApplyError::InternalError(format!("{}", err)))?;
        Ok(())
    }

    pub fn get_table(
        &mut self,
        name: &str,
    ) -> Result<Option<record::Table>, ApplyError> {
        let address = make_table_address(name);
        let d = self.context.get_state(vec![address])?;
        match d {
            Some(packed) => {
                let tables: record::TableContainer =
                    match protobuf::parse_from_bytes(packed.as_slice()) {
                        Ok(tables) => tables,
                        Err(_) => {
                            return Err(ApplyError::InternalError(String::from(
                                "Cannot deserialize table container",
                            )))
                        }
                    };

                for table in tables.get_entries() {
                    if table.name == name {
                        return Ok(Some(table.clone()));
                    }
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub fn set_table(
        &mut self,
        name: &str,
        table: record::Table,
    ) -> Result<(), ApplyError> {
        let address = make_table_address(name);
        let d = self.context.get_state(vec![address.clone()])?;
        let mut tables = match d {
            Some(packed) => match protobuf::parse_from_bytes(packed.as_slice()) {
                Ok(tables) => tables,
                Err(_) => {
                    return Err(ApplyError::InternalError(String::from(
                        "Cannot deserialize table container",
                    )))
                }
            },
            None => record::TableContainer::new(),
        };

        tables.entries.push(table);
        tables.entries.sort_by_key(|rt| rt.clone().name);
        let serialized = match tables.write_to_bytes() {
            Ok(serialized) => serialized,
            Err(_) => {
                return Err(ApplyError::InternalError(String::from(
                    "Cannot serialize table container",
                )))
            }
        };
        let mut sets = HashMap::new();
        sets.insert(address, serialized);
        self.context
            .set_state(sets)
            .map_err(|err| ApplyError::InternalError(format!("{}", err)))?;
        Ok(())
    }

    pub fn get_participant(
        &mut self, 
        participant_id: &str
    ) -> Result<Option<participant::Participant>, ApplyError> {
        let address = make_participant_address(participant_id);
        let d = self.context.get_state(vec![address])?;
        match d {
            Some(packed) => {
                let participants: participant::ParticipantContainer =
                    match protobuf::parse_from_bytes(packed.as_slice()) {
                        Ok(participants) => participants,
                        Err(_) => {
                            return Err(ApplyError::InternalError(String::from(
                                "Cannot deserialize participant container",
                            )))
                        }
                    };

                for participant in participants.get_entries() {
                    if participant.public_key == participant_id {
                        return Ok(Some(participant.clone()));
                    }
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub fn set_participant(
        &mut self, 
        participant_id: &str, 
        participant: participant::Participant
    ) -> Result<(), ApplyError> {
        let address = make_participant_address(participant_id);
        let d = self.context.get_state(vec![address.clone()])?;
        let mut participant_container = match d {
            Some(packed) => match protobuf::parse_from_bytes(packed.as_slice()) {
                Ok(participants) => participants,
                Err(_) => {
                    return Err(ApplyError::InternalError(String::from(
                        "Cannot deserialize participant container",
                    )))
                }
            },
            None => participant::ParticipantContainer::new(),
        };

        // remove old participant if it exists and sort the participants by public_key
        let participants = participant_container.get_entries().to_vec();
        let mut index = None;
        let mut count = 0;
        for participant in participants.clone() {
            if participant.public_key == participant_id {
                index = Some(count);
                break;
            }
            count = count + 1;
        }

        match index {
            Some(x) => {
                participant_container.entries.remove(x);
            }
            None => (),
        };
        participant_container.entries.push(participant);
        participant_container.entries.sort_by_key(|r| r.clone().public_key);

        let serialized = match participant_container.write_to_bytes() {
            Ok(serialized) => serialized,
            Err(_) => {
                return Err(ApplyError::InternalError(String::from(
                    "Cannot serialize participant container",
                )))
            }
        };
        let mut sets = HashMap::new();
        sets.insert(address, serialized);
        self.context
            .set_state(sets)
            .map_err(|err| ApplyError::InternalError(format!("{}", err)))?;
        Ok(())
    }

    pub fn get_property(
        &mut self,
        record_id: &str,
        property_name: &str,
    ) -> Result<Option<property::Property>, ApplyError> {
        let address = make_property_address(record_id, property_name, 0);
        let d = self.context.get_state(vec![address])?;
        match d {
            Some(packed) => {
                let properties: property::PropertyContainer =
                    match protobuf::parse_from_bytes(packed.as_slice()) {
                        Ok(properties) => properties,
                        Err(_) => {
                            return Err(ApplyError::InternalError(String::from(
                                "Cannot deserialize property container",
                            )))
                        }
                    };

                for property in properties.get_entries() {
                    if property.name == property_name {
                        return Ok(Some(property.clone()));
                    }
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub fn set_property(
        &mut self,
        record_id: &str,
        property_name: &str,
        property: property::Property,
    ) -> Result<(), ApplyError> {
        let address = make_property_address(record_id, property_name, 0);
        let d = self.context.get_state(vec![address.clone()])?;
        let mut property_container = match d {
            Some(packed) => match protobuf::parse_from_bytes(packed.as_slice()) {
                Ok(properties) => properties,
                Err(_) => {
                    return Err(ApplyError::InternalError(String::from(
                        "Cannot deserialize property container",
                    )))
                }
            },
            None => property::PropertyContainer::new(),
        };
        // remove old property if it exists and sort the properties by name
        let properties = property_container.get_entries().to_vec();
        let mut index = None;
        let mut count = 0;
        for prop in properties.clone() {
            if prop.name == property_name {
                index = Some(count);
                break;
            }
            count = count + 1;
        }

        match index {
            Some(x) => {
                property_container.entries.remove(x);
            }
            None => (),
        };
        property_container.entries.push(property);
        property_container.entries.sort_by_key(|p| p.clone().name);
        let serialized = match property_container.write_to_bytes() {
            Ok(serialized) => serialized,
            Err(_) => {
                return Err(ApplyError::InternalError(String::from(
                    "Cannot serialize property container",
                )))
            }
        };
        let mut sets = HashMap::new();
        sets.insert(address, serialized);
        self.context
            .set_state(sets)
            .map_err(|err| ApplyError::InternalError(format!("{}", err)))?;
        Ok(())
    }

    pub fn get_property_page(
        &mut self,
        record_id: &str,
        property_name: &str,
        page: u32,
    ) -> Result<Option<property::PropertyPage>, ApplyError> {
        let address = make_property_address(record_id, property_name, page);
        let d = self.context.get_state(vec![address])?;
        match d {
            Some(packed) => {
                let property_pages: property::PropertyPageContainer =
                    match protobuf::parse_from_bytes(packed.as_slice()) {
                        Ok(property_pages) => property_pages,
                        Err(_) => {
                            return Err(ApplyError::InternalError(String::from(
                                "Cannot deserialize property page container",
                            )))
                        }
                    };

                for property_page in property_pages.get_entries() {
                    if property_page.name == property_name {
                        return Ok(Some(property_page.clone()));
                    }
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub fn set_property_page(
        &mut self,
        record_id: &str,
        property_name: &str,
        page_num: u32,
        property_page: property::PropertyPage,
    ) -> Result<(), ApplyError> {
        let address = make_property_address(record_id, property_name, page_num);
        let d = self.context.get_state(vec![address.clone()])?;
        let mut property_pages = match d {
            Some(packed) => match protobuf::parse_from_bytes(packed.as_slice()) {
                Ok(property_pages) => property_pages,
                Err(_) => {
                    return Err(ApplyError::InternalError(String::from(
                        "Cannot deserialize property page container",
                    )))
                }
            },
            None => property::PropertyPageContainer::new(),
        };
        // remove old property page if it exists and sort the property pages by name
        let pages = property_pages.get_entries().to_vec();
        let mut index = None;
        let mut count = 0;
        for page in pages.clone() {
            if page.name == property_name {
                index = Some(count);
                break;
            }
            count = count + 1;
        }

        match index {
            Some(x) => {
                property_pages.entries.remove(x);
            }
            None => (),
        };
        property_pages.entries.push(property_page);
        property_pages.entries.sort_by_key(|pp| pp.clone().name);
        let serialized = match property_pages.write_to_bytes() {
            Ok(serialized) => serialized,
            Err(_) => {
                return Err(ApplyError::InternalError(String::from(
                    "Cannot serialize property page container",
                )))
            }
        };
        let mut sets = HashMap::new();
        sets.insert(address, serialized);
        self.context
            .set_state(sets)
            .map_err(|err| ApplyError::InternalError(format!("{}", err)))?;
        Ok(())
    }

    pub fn get_proposal(
        &mut self,
        proposal_id: &str,
    ) -> Result<Option<proposal::Proposal>, ApplyError> {
        let address = make_proposal_address(proposal_id);
        let d = self.context.get_state(vec![address])?;
        match d {
            Some(packed) => {
                let proposals: proposal::ProposalContainer =
                    match protobuf::parse_from_bytes(packed.as_slice()) {
                        Ok(proposals) => proposals,
                        Err(_) => {
                            return Err(ApplyError::InternalError(String::from(
                                "Cannot deserialize proposal container",
                            )))
                        }
                    };

                for proposal in proposals.get_entries() {
                    if proposal.proposal_id == proposal_id {
                        return Ok(Some(proposal.clone()));
                    }
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub fn set_proposal(
        &mut self,
        proposal_id: &str,
        proposal: proposal::Proposal,
    ) -> Result<(), ApplyError> {
        let address = make_proposal_address(proposal_id);
        let d = self.context.get_state(vec![address.clone()])?;
        let mut proposal_container = match d {
            Some(packed) => match protobuf::parse_from_bytes(packed.as_slice()) {
                Ok(proposals) => proposals,
                Err(_) => {
                    return Err(ApplyError::InternalError(String::from(
                        "Cannot deserialize proposal container",
                    )))
                }
            },
            None => proposal::ProposalContainer::new(),
        };

        // remove old proposal if it exists and sort the proposals by proposal_id
        let proposals = proposal_container.get_entries().to_vec();
        let mut index = None;
        let mut count = 0;
        for proposal in proposals.clone() {
            if proposal.proposal_id == proposal_id {
                index = Some(count);
                break;
            }
            count = count + 1;
        }

        match index {
            Some(x) => {
                proposal_container.entries.remove(x);
            }
            None => (),
        };
        proposal_container.entries.push(proposal);
        proposal_container.entries.sort_by_key(|r| r.clone().proposal_id);

        let serialized = match proposal_container.write_to_bytes() {
            Ok(serialized) => serialized,
            Err(_) => {
                return Err(ApplyError::InternalError(String::from(
                    "Cannot serialize proposal container",
                )))
            }
        };
        let mut sets = HashMap::new();
        sets.insert(address, serialized);
        self.context
            .set_state(sets)
            .map_err(|err| ApplyError::InternalError(format!("{}", err)))?;
        Ok(())
    }

    pub fn get_exchange(
        &mut self,
        buy_proposal_id: &str,
        sell_proposal_id: &str,
    ) -> Result<Option<proposal::Exchange>, ApplyError> {
        let address = make_exchange_address(buy_proposal_id, sell_proposal_id);
        let d = self.context.get_state(vec![address])?;
        match d {
            Some(packed) => {
                let exchanges: proposal::ExchangeContainer =
                    match protobuf::parse_from_bytes(packed.as_slice()) {
                        Ok(exchanges) => exchanges,
                        Err(_) => {
                            return Err(ApplyError::InternalError(String::from(
                                "Cannot deserialize exchange container",
                            )))
                        }
                    };

                for exchange in exchanges.get_entries() {
                    if exchange.buy_proposal_id == buy_proposal_id 
                    && exchange.sell_proposal_id == sell_proposal_id {
                        return Ok(Some(exchange.clone()));
                    }
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub fn set_exchange(
        &mut self,
        buy_proposal_id: &str,
        sell_proposal_id: &str,
        exchange: proposal::Exchange,
    ) -> Result<(), ApplyError> {
        let address = make_exchange_address(buy_proposal_id, sell_proposal_id);
        let d = self.context.get_state(vec![address.clone()])?;
        let mut exchange_container = match d {
            Some(packed) => match protobuf::parse_from_bytes(packed.as_slice()) {
                Ok(exchanges) => exchanges,
                Err(_) => {
                    return Err(ApplyError::InternalError(String::from(
                        "Cannot deserialize exchange container",
                    )))
                }
            },
            None => proposal::ExchangeContainer::new(),
        };

        // remove old exchange if it exists and sort the exchanges by proposal_id
        let exchanges = exchange_container.get_entries().to_vec();
        let mut index = None;
        let mut count = 0;
        for exchange in exchanges.clone() {
            if exchange.buy_proposal_id == buy_proposal_id
            && exchange.sell_proposal_id == sell_proposal_id {
                index = Some(count);
                break;
            }
            count = count + 1;
        }

        match index {
            Some(x) => {
                exchange_container.entries.remove(x);
            }
            None => (),
        };
        exchange_container.entries.push(exchange);
        exchange_container.entries.sort_by_key(|r| (r.clone().buy_proposal_id, r.clone().sell_proposal_id));

        let serialized = match exchange_container.write_to_bytes() {
            Ok(serialized) => serialized,
            Err(_) => {
                return Err(ApplyError::InternalError(String::from(
                    "Cannot serialize exchange container",
                )))
            }
        };
        let mut sets = HashMap::new();
        sets.insert(address, serialized);
        self.context
            .set_state(sets)
            .map_err(|err| ApplyError::InternalError(format!("{}", err)))?;
        Ok(())
    }
/*
    pub fn get_exchange(
        &mut self,
        timestamp: u64,
    ) -> Result<Option<proposal::Exchange>, ApplyError> {
        let address = make_exchange_address(timestamp);
        let d = self.context.get_state(vec![address])?;
        match d {
            Some(packed) => {
                let exchanges: proposal::ExchangeContainer =
                    match protobuf::parse_from_bytes(packed.as_slice()) {
                        Ok(exchanges) => exchanges,
                        Err(_) => {
                            return Err(ApplyError::InternalError(String::from(
                                "Cannot deserialize exchange container",
                            )))
                        }
                    };

                for exchange in exchanges.get_entries() {
                    if exchange.timestamp == timestamp {
                        return Ok(Some(exchange.clone()));
                    }
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub fn set_exchange(
        &mut self,
        timestamp: u64,
        exchange: proposal::Exchange,
    ) -> Result<(), ApplyError> {
        let address = make_exchange_address(timestamp);
        let d = self.context.get_state(vec![address.clone()])?;
        let mut exchange_container = match d {
            Some(packed) => match protobuf::parse_from_bytes(packed.as_slice()) {
                Ok(exchanges) => exchanges,
                Err(_) => {
                    return Err(ApplyError::InternalError(String::from(
                        "Cannot deserialize exchange container",
                    )))
                }
            },
            None => proposal::ExchangeContainer::new(),
        };

        // remove old exchange if it exists and sort the exchanges by proposal_id
        let exchanges = exchange_container.get_entries().to_vec();
        let mut index = None;
        let mut count = 0;
        for exchange in exchanges.clone() {
            if exchange.timestamp == timestamp {
                index = Some(count);
                break;
            }
            count = count + 1;
        }

        match index {
            Some(x) => {
                exchange_container.entries.remove(x);
            }
            None => (),
        };
        exchange_container.entries.push(exchange);
        exchange_container.entries.sort_by_key(|r| r.clone().timestamp);

        let serialized = match exchange_container.write_to_bytes() {
            Ok(serialized) => serialized,
            Err(_) => {
                return Err(ApplyError::InternalError(String::from(
                    "Cannot serialize exchange container",
                )))
            }
        };
        let mut sets = HashMap::new();
        sets.insert(address, serialized);
        self.context
            .set_state(sets)
            .map_err(|err| ApplyError::InternalError(format!("{}", err)))?;
        Ok(())
    }
*/    
}

pub struct TransactionHandlerDGC {
    family_name: String,
    family_versions: Vec<String>,
    namespaces: Vec<String>,
}

impl TransactionHandlerDGC {
    pub fn new() -> TransactionHandlerDGC {
        TransactionHandlerDGC {
            family_name: "dgc_REST_api".to_string(),
            family_versions: vec!["1.1".to_string()],
            namespaces: vec![get_dgc_rest_api_prefix().to_string()],
        }
    }

    fn _create_participant(
        &self,
        payload: payload::CreateParticipantAction,
        mut state: StateDGC,
        signer: &str,
        timestamp: u64,
    ) -> Result<(), ApplyError> {
        let name = payload.get_name();
        match state.get_participant(signer) {
            Ok(Some(_)) => {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Participant already exists: {}",
                    name
                )))
            }
            Ok(None) => (),
            Err(err) => return Err(err),
        }

        let mut new_participant = participant::Participant::new();
        new_participant.set_public_key(signer.to_string());
        new_participant.set_name(name.to_string());
        new_participant.set_timestamp(timestamp);
        state.set_participant(signer, new_participant)?;
        Ok(())
    }

    fn _create_record(
        &self,
        payload: payload::CreateRecordAction,
        mut state: StateDGC,
        signer: &str,
        timestamp: u64,
    ) -> Result<(), ApplyError> {
        match state.get_participant(signer) {
            Ok(Some(_)) => (),
            Ok(None) => {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Participant is not register: {}",
                    signer
                )))
            }
            Err(err) => return Err(err),
        }
        let record_id = payload.get_record_id();
        match state.get_record(record_id) {
            Ok(Some(_)) => {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Record already exists: {}",
                    record_id
                )))
            }
            Ok(None) => (),
            Err(err) => return Err(err),
        }

        let name = payload.get_table();
        let table = match state.get_table(name) {
            Ok(Some(table)) => table,
            Ok(None) => {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Table does not exist {}",
                    name
                )))
            }
            Err(err) => return Err(err),
        };

        let mut table_schema: HashMap<&str, property::PropertySchema> = HashMap::new();
        let mut required_properties: HashMap<&str, property::PropertySchema> = HashMap::new();
        let mut provided_properties: HashMap<&str, property::PropertyValue> = HashMap::new();
        for property in table.get_properties() {
            table_schema.insert(property.get_name(), property.clone());
            if property.get_required() {
                required_properties.insert(property.get_name(), property.clone());
            }
        }

        for property in payload.get_properties() {
            provided_properties.insert(property.get_name(), property.clone());
        }

        for name in required_properties.keys() {
            if !provided_properties.contains_key(name) {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Required property {} not provided",
                    name
                )));
            }
        }

        for (provided_name, provided_properties) in provided_properties.clone() {
            let required_data_type = match table_schema.get(provided_name) {
                Some(required_data_type) => required_data_type.data_type,
                None => {
                    return Err(ApplyError::InvalidTransaction(format!(
                        "Provided property {} is not in schemata",
                        provided_name
                    )))
                }
            };
            let provided_data_type = provided_properties.data_type;
            if provided_data_type != required_data_type {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Value provided for {} is the wrong type",
                    provided_name
                )));
            };

            let is_delayed = match table_schema.get(provided_name) {
                Some(property_schema) => property_schema.delayed,
                None => false,
            };
            if is_delayed {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Property is 'delayed', and cannot be set at record creation: {}",
                    provided_name
                )));
            };
        }
        let mut new_record = record::Record::new();
        new_record.set_record_id(record_id.to_string());
        new_record.set_table(name.to_string());
        new_record.set_field_final(false);

        let mut owner = record::Record_AssociatedParticipant::new();
        owner.set_participant_id(signer.to_string());
        owner.set_timestamp(timestamp);
        new_record.owners.push(owner.clone());
        new_record.custodians.push(owner.clone());

        state.set_record(record_id, new_record)?;

        let mut reporter = property::Property_Reporter::new();
        reporter.set_public_key(signer.to_string());
        reporter.set_authorized(true);
        reporter.set_index(0);

        for (property_name, property) in table_schema {
            let mut new_property = property::Property::new();
            new_property.set_name(property_name.to_string());
            new_property.set_record_id(record_id.to_string());
            new_property.set_data_type(property.get_data_type());
            new_property.reporters.push(reporter.clone());
            new_property.set_current_page(1);
            new_property.set_wrapped(false);
            new_property.set_fixed(property.get_fixed());
            new_property.set_number_exponent(property.get_number_exponent());
            new_property.set_enum_options(
                RepeatedField::from_vec(property.get_enum_options().to_vec()));
            new_property.set_struct_properties(
                RepeatedField::from_vec(property.get_struct_properties().to_vec()));
            new_property.set_unit(property.get_unit().to_string());

            state.set_property(record_id, property_name, new_property.clone())?;

            let mut new_property_page = property::PropertyPage::new();
            new_property_page.set_name(property_name.to_string());
            new_property_page.set_record_id(record_id.to_string());

            if provided_properties.contains_key(property_name) {
                let provided_property = &provided_properties[property_name];
                let reported_value = match self._make_new_reported_value(
                    0,
                    timestamp,
                    provided_property,
                    &new_property,
                ) {
                    Ok(reported_value) => reported_value,
                    Err(err) => return Err(err),
                };

                new_property_page.reported_values.push(reported_value);
            }
            state.set_property_page(record_id, property_name, 1, new_property_page)?;
        }

        Ok(())
    }

    fn _finalize_record(
        &self,
        payload: payload::FinalizeRecordAction,
        mut state: StateDGC,
        signer: &str,
    ) -> Result<(), ApplyError> {
        let record_id = payload.get_record_id();
        let final_record = match state.get_record(record_id) {
            Ok(Some(final_record)) => final_record,
            Ok(None) => {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Record does not exist: {}",
                    record_id
                )))
            }
            Err(err) => return Err(err),
        };
        let owner = match final_record.owners.last() {
            Some(x) => x,
            None => {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "Owner was not found",
                )))
            }
        };
        let custodian = match final_record.custodians.last() {
            Some(x) => x,
            None => {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "Custodian was not found",
                )))
            }
        };

        if owner.participant_id != signer || custodian.participant_id != signer {
            return Err(ApplyError::InvalidTransaction(format!(
                "Must be owner and custodian to finalize record"
            )));
        }
        if final_record.get_field_final() {
            return Err(ApplyError::InvalidTransaction(format!(
                "Record is already final: {}",
                record_id
            )));
        }

        let mut record_clone = final_record.clone();
        record_clone.set_field_final(true);
        state.set_record(record_id, record_clone)?;

        Ok(())
    }

    fn _create_table(
        &self,
        payload: payload::CreateTableAction,
        mut state: StateDGC,
        signer: &str,
    ) -> Result<(), ApplyError> {
/*        
        match state.get_participant(signer) {
            Ok(Some(_)) => (),
            Ok(None) => {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Participant is not register: {}",
                    signer
                )))
            }
            Err(err) => return Err(err),
        }
*/        
        let name = payload.get_name();
        let mut provided_properties: HashMap<&str, property::PropertySchema> = HashMap::new();
        for property in payload.get_properties() {
            provided_properties.insert(property.get_name(), property.clone());
        }
        match state.get_table(name) {
            Ok(Some(_)) => {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Table already exists: {}",
                    signer
                )))
            }
            Ok(None) => (),
            Err(err) => return Err(err),
        }
        let mut table = record::Table::new();
        table.set_name(name.to_string());
        table.set_properties(RepeatedField::from_vec(payload.get_properties().to_vec()));

        state.set_table(name, table)?;

        Ok(())
    }

    fn _update_properties(
        &self,
        payload: payload::UpdatePropertiesAction,
        mut state: StateDGC,
        signer: &str,
        timestamp: u64,
    ) -> Result<(), ApplyError> {
        let record_id = payload.get_record_id();
        let update_record = match state.get_record(record_id) {
            Ok(Some(update_record)) => update_record,
            Ok(None) => {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Record does not exist: {}",
                    record_id
                )))
            }
            Err(err) => return Err(err),
        };

        if update_record.get_field_final() {
            return Err(ApplyError::InvalidTransaction(format!(
                "Record is final: {}",
                record_id
            )));
        }

        let updates = payload.get_properties();

        for update in updates {
            let name = update.get_name();
            let data_type = update.get_data_type();

            let mut prop = match state.get_property(record_id, name) {
                Ok(Some(prop)) => prop,
                Ok(None) => {
                    return Err(ApplyError::InvalidTransaction(format!(
                        "Record does not have provided poperty: {}",
                        name
                    )))
                }
                Err(err) => return Err(err),
            };

            let mut allowed = false;
            let mut reporter_index = 0;
            for reporter in prop.get_reporters() {
                if reporter.get_public_key() == signer && reporter.get_authorized() {
                    allowed = true;
                    reporter_index = reporter.get_index();
                    break;
                }
            }
            if !allowed {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Reporter is not authorized: {}",
                    signer
                )));
            }

            if prop.fixed {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Property is fixed and cannot be updated: {}",
                    prop.name
                )));
            }

            if data_type != prop.data_type {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Update has wrong type: {:?} != {:?}",
                    data_type, prop.data_type
                )));
            }

            let page_number = prop.get_current_page();
            let mut page = match state.get_property_page(record_id, name, page_number) {
                Ok(Some(page)) => page,
                Ok(None) => {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Property page does not exist",
                    )))
                }
                Err(err) => return Err(err),
            };

            let reported_value = match self._make_new_reported_value(
                reporter_index,
                timestamp,
                update,
                &prop,
            ) {
                Ok(reported_value) => reported_value,
                Err(err) => return Err(err),
            };
            page.reported_values.push(reported_value);
            page.reported_values
                .sort_by_key(|rv| (rv.clone().timestamp, rv.clone().reporter_index));
            state.set_property_page(record_id, name, page_number, page.clone())?;
            if page.reported_values.len() >= PROPERTY_PAGE_MAX_LENGTH {
                let mut new_page_number = page_number + 1;
                if page_number + 1 <= PROPERTY_PAGE_MAX_LENGTH as u32 {
                    new_page_number = 1;
                }

                let new_page = match state.get_property_page(record_id, name, new_page_number) {
                    Ok(Some(mut new_page)) => {
                        new_page.set_reported_values(RepeatedField::from_vec(Vec::new()));
                        new_page
                    }
                    Ok(None) => {
                        let mut new_page = property::PropertyPage::new();
                        new_page.set_name(name.to_string());
                        new_page.set_record_id(record_id.to_string());
                        new_page
                    }
                    Err(err) => return Err(err),
                };
                state.set_property_page(record_id, name, new_page_number, new_page)?;

                prop.set_current_page(new_page_number);
                if new_page_number == 1 && !prop.get_wrapped() {
                    prop.set_wrapped(true);
                }
                state.set_property(record_id, name, prop)?;
            }
        }

        Ok(())
    }

    fn _create_proposal(
        &self,
        payload: payload::CreateProposalAction,
        mut state: StateDGC,
        signer: &str,
        timestamp: u64,
    ) -> Result<(), ApplyError> {
        let role = payload.get_role();

        let i_participant = match state.get_participant(signer) {
            Ok(Some(participant)) => participant,
            Ok(None) => {
                return Err(ApplyError::InvalidTransaction(format!(
                "Issuing participant does not exist: {}",
                    signer
                )))
            }
            Err(err) => return Err(err),
        };
            
        if role == proposal::Proposal_Role::transferOwnership
        || role == proposal::Proposal_Role::authorizeReporter
        || role == proposal::Proposal_Role::transferCustodianship
        || role == proposal::Proposal_Role::creditDGC
        || role == proposal::Proposal_Role::transferDGC {
            match state.get_participant(&payload.get_receiving_participant()) {
                Ok(Some(participant)) => participant,
                Ok(None) => {
                    return Err(ApplyError::InvalidTransaction(format!(
                        "Receiving participant does not exist: {}",
                        payload.get_receiving_participant()
                    )))
                }
                Err(err) => return Err(err),
            };
        }

        if role == proposal::Proposal_Role::transferOwnership
        || role == proposal::Proposal_Role::authorizeReporter {
            let proposal_record = match state.get_record(&payload.get_record_id()) {
                Ok(Some(record)) => record,
                Ok(None) => {
                    return Err(ApplyError::InvalidTransaction(format!(
                        "Record does not exist: {}",
                        payload.get_record_id()
                    )))
                }
                Err(err) => return Err(err),
            };

            if proposal_record.get_field_final() {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Record is final: {}",
                    payload.get_record_id()
                )));
            }

            let owner = match proposal_record.owners.last() {
                Some(owner) => owner,
                None => {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Owner not found",
                    )))
                }
            };

            if owner.get_participant_id() != signer {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "Only the owner can create a proposal to change ownership",
                )));
            }
        }

        if role == proposal::Proposal_Role::transferCustodianship {
            let proposal_record = match state.get_record(&payload.get_record_id()) {
                Ok(Some(record)) => record,
                Ok(None) => {
                    return Err(ApplyError::InvalidTransaction(format!(
                        "Record does not exist: {}",
                        payload.get_record_id()
                    )))
                }
                Err(err) => return Err(err),
            };

            if proposal_record.get_field_final() {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Record is final: {}",
                    payload.get_record_id()
                )));
            }

            let custodian = match proposal_record.custodians.last() {
                Some(custodian) => custodian,
                None => {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Custodian not found",
                    )))
                }
            };

            if custodian.get_participant_id() != signer {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "Only the custodian can create a proposal to change custodianship",
                )));
            }
        }

        if role == proposal::Proposal_Role::sellDGC {
            // To confirm the dg_coin_amount is less than the balance + credit
            let credit = match i_participant.clone().dg_coin_credits.last() {
                Some(credit) => credit.clone(),
                None => participant::Participant_CreditBalance::new(),
            };
            let i_dg_coin_credit = credit.get_dg_coin_amount();

            let new_i_balance = match i_participant.clone().dg_coin_balances.last() {
                Some(balance) => balance.clone(),
                None => participant::Participant_CreditBalance::new(),
            };
            let i_dg_coin_balance = new_i_balance.get_dg_coin_amount();
                                                        
            if (i_dg_coin_balance + i_dg_coin_credit) < payload.get_dg_coin_amount()  {
                return Err(ApplyError::InvalidTransaction(format!(
                    "The dg coin balance of issuing participant is not enough: {}",
                    signer
                )))
            }
        }

        if role == proposal::Proposal_Role::transferDGC {
            // To confirm the dg_coin_amount is less than the balance
            let new_i_balance = match i_participant.clone().dg_coin_balances.last() {
                Some(balance) => balance.clone(),
                None => participant::Participant_CreditBalance::new(),
            };
            let i_dg_coin_balance = new_i_balance.get_dg_coin_amount();
                                                        
            if i_dg_coin_balance < payload.get_dg_coin_amount()  {
                return Err(ApplyError::InvalidTransaction(format!(
                    "The dg coin balance of issuing participant is not enough: {} /{:?}",
                    signer,
                    //i_dg_coin_balance
                    new_i_balance
                )))
            }
        }

        let mut new_proposal = proposal::Proposal::new();
        new_proposal.set_proposal_id(payload.get_proposal_id().to_string());
        new_proposal.set_status(proposal::Proposal_Status::OPEN);
        new_proposal.set_role(role);
        new_proposal.set_timestamp(timestamp);
        new_proposal.set_issuing_participant(signer.to_string());
        new_proposal.set_receiving_participant(payload.get_receiving_participant().to_string());
        new_proposal.set_record_id(payload.get_record_id().to_string());
        new_proposal.set_properties(RepeatedField::from_vec(payload.get_properties().to_vec()));
        new_proposal.set_dg_coin_amount(payload.get_dg_coin_amount());
        new_proposal.set_currency_iso_codes(payload.get_currency_iso_codes().to_string());
        new_proposal.set_currency_quote_amount(payload.get_currency_quote_amount());
        state.set_proposal(payload.get_proposal_id(), new_proposal)?;

        Ok(())
    }

    fn _answer_proposal(
        &self,
        payload: payload::AnswerProposalAction,
        mut state: StateDGC,
        signer: &str,
        timestamp: u64,
    ) -> Result<(), ApplyError> {
        let proposal_id = payload.get_proposal_id();
        let response = payload.get_response();
        let role = payload.get_role();
        let receiving_participant = payload.get_receiving_participant();
        let record_id = payload.get_record_id();
        let dg_coin_amount = payload.get_dg_coin_amount();

        let mut current_proposal = match state.get_proposal(proposal_id) {
            Ok(Some(proposal)) => proposal,
            Ok(None) => {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "Proposal does not exist",
                )))
            }
            Err(err) => return Err(err),
        };
            
        let mut i_participant = match state.get_participant(signer) {
            Ok(Some(participant)) => participant.clone(),
            Ok(None) => {
                return Err(ApplyError::InvalidTransaction(format!(
                "Issuing participant does not exist: {}",
                    signer
                )))
            }
            Err(err) => return Err(err),
        };

        match response {
            payload::AnswerProposalAction_Response::CANCEL => {
                if current_proposal.get_issuing_participant() != signer {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Only the issuing participant can cancel a proposal",
                    )));
                }
                current_proposal.set_status(proposal::Proposal_Status::CANCELED);
                state.set_proposal(proposal_id, current_proposal)?;
            }
            payload::AnswerProposalAction_Response::REJECT => {
                if current_proposal.get_receiving_participant() != signer {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Only the receiving participant can reject a proposal",
                    )));
                }
                current_proposal.set_status(proposal::Proposal_Status::REJECTED);
                state.set_proposal(proposal_id, current_proposal)?;
            }
            payload::AnswerProposalAction_Response::autoOPEN => {
                match role {
                    proposal::Proposal_Role::transferOwnership => {}
                    proposal::Proposal_Role::transferCustodianship => {}
                    proposal::Proposal_Role::authorizeReporter => {}
                    proposal::Proposal_Role::buyDGC => {
                        // To increase the dg_coin_balance for issuing_participant(buy)
                        let mut new_i_balance = match i_participant.clone().dg_coin_balances.last() {
                            Some(balance) => balance.clone(),
                            None => participant::Participant_CreditBalance::new(),
                        };
                        let i_dg_coin_balance = new_i_balance.get_dg_coin_amount();
                                                        
                        new_i_balance.set_proposal_id(proposal_id.to_string());
                        new_i_balance.set_timestamp(timestamp);
                        new_i_balance.set_dg_coin_amount(i_dg_coin_balance + dg_coin_amount);
                        i_participant.dg_coin_balances.push(new_i_balance);
                        state.set_participant(signer, i_participant.clone())?;

                        let dg_coin_exchanged = current_proposal.get_dg_coin_exchanged();
                        current_proposal.set_dg_coin_exchanged(dg_coin_exchanged+dg_coin_amount);
                        current_proposal.set_status(proposal::Proposal_Status::OPEN);
                        state.set_proposal(payload.get_proposal_id(), current_proposal)?;
                    }
                    proposal::Proposal_Role::sellDGC => {
                        // To decrease the dg_coin_balance for issuing_participant(sell)
                        let credit = match i_participant.clone().dg_coin_credits.last() {
                            Some(credit) => credit.clone(),
                            None => participant::Participant_CreditBalance::new(),
                        };
                        let i_dg_coin_credit = credit.get_dg_coin_amount();

                        let mut new_i_balance = match i_participant.clone().dg_coin_balances.last() {
                            Some(balance) => balance.clone(),
                            None => participant::Participant_CreditBalance::new(),
                        };
                        let i_dg_coin_balance = new_i_balance.get_dg_coin_amount();
                                                        
                        if (i_dg_coin_balance + i_dg_coin_credit) < (dg_coin_amount) {
                            return Err(ApplyError::InvalidTransaction(format!(
                                "The dg coin balance of issuing participant is not enough: {}",
                                signer
                            )))
                        }

                        new_i_balance.set_proposal_id(proposal_id.to_string());
                        new_i_balance.set_timestamp(timestamp);
                        new_i_balance.set_dg_coin_amount(i_dg_coin_balance - dg_coin_amount);
                        i_participant.dg_coin_balances.push(new_i_balance);
                        state.set_participant(signer, i_participant.clone())?;

                        let dg_coin_exchanged = current_proposal.get_dg_coin_exchanged();
                        current_proposal.set_dg_coin_exchanged(dg_coin_exchanged+dg_coin_amount);
                        current_proposal.set_status(proposal::Proposal_Status::OPEN);
                        state.set_proposal(payload.get_proposal_id(), current_proposal)?;
                    }
                    proposal::Proposal_Role::creditDGC => {}
                    proposal::Proposal_Role::transferDGC => {}
                }
            }
            payload::AnswerProposalAction_Response::autoCLOSE => {
                match role {
                    proposal::Proposal_Role::transferOwnership => {}
                    proposal::Proposal_Role::transferCustodianship => {}
                    proposal::Proposal_Role::authorizeReporter => {}
                    proposal::Proposal_Role::buyDGC => {
                        // To increase the dg_coin_balance for issuing_participant(buy)
                        let mut new_i_balance = match i_participant.clone().dg_coin_balances.last() {
                            Some(balance) => balance.clone(),
                            None => participant::Participant_CreditBalance::new(),
                        };
                        let i_dg_coin_balance = new_i_balance.get_dg_coin_amount();
                                                        
                        new_i_balance.set_proposal_id(proposal_id.to_string());
                        new_i_balance.set_timestamp(timestamp);
                        new_i_balance.set_dg_coin_amount(i_dg_coin_balance + dg_coin_amount);
                        i_participant.dg_coin_balances.push(new_i_balance);
                        state.set_participant(signer, i_participant.clone())?;

                        //let mut exchanges: HashMap<&str, proposal::Exchange> = HashMap::new();
                        for exchange in payload.get_exchanges() {
                            //exchanges.insert(exchange.get_buy_proposal_id(), exchange.clone());
                        //}
                        //for (buy_proposal_id, exchange) in exchanges {
                            let mut new_exchange = proposal::Exchange::new();
                            new_exchange.set_buy_proposal_id(exchange.get_buy_proposal_id().to_string());
                            new_exchange.set_sell_proposal_id(exchange.get_sell_proposal_id().to_string());
                            new_exchange.set_timestamp(exchange.get_timestamp());
                            new_exchange.set_currency_iso_codes(exchange.get_currency_iso_codes().to_string());
                            new_exchange.set_last_currency_price(exchange.get_last_currency_price());
                            new_exchange.set_last_dgc_price(exchange.get_last_dgc_price());
                            state.set_exchange(exchange.get_buy_proposal_id(), exchange.get_sell_proposal_id(), new_exchange)?;
                        }

                        let dg_coin_exchanged = current_proposal.get_dg_coin_exchanged();
                        current_proposal.set_dg_coin_exchanged(dg_coin_exchanged+dg_coin_amount);
                        current_proposal.set_status(proposal::Proposal_Status::CLOSED);
                        state.set_proposal(proposal_id, current_proposal)?;
                    }
                    proposal::Proposal_Role::sellDGC => {
                        // To decrease the dg_coin_balance for issuing_participant(sell)
                        let credit = match i_participant.clone().dg_coin_credits.last() {
                            Some(credit) => credit.clone(),
                            None => participant::Participant_CreditBalance::new(),
                        };
                        let i_dg_coin_credit = credit.get_dg_coin_amount();

                        let mut new_i_balance = match i_participant.clone().dg_coin_balances.last() {
                            Some(balance) => balance.clone(),
                            None => participant::Participant_CreditBalance::new(),
                        };
                        let i_dg_coin_balance = new_i_balance.get_dg_coin_amount();
                                                        
                        if (i_dg_coin_balance + i_dg_coin_credit) < (dg_coin_amount) {
                            return Err(ApplyError::InvalidTransaction(format!(
                                "The dg coin balance of issuing participant is not enough: {}",
                                signer
                            )))
                        }

                        new_i_balance.set_proposal_id(proposal_id.to_string());
                        new_i_balance.set_timestamp(timestamp);
                        new_i_balance.set_dg_coin_amount(i_dg_coin_balance - dg_coin_amount);
                        i_participant.dg_coin_balances.push(new_i_balance);
                        state.set_participant(signer, i_participant.clone())?;

                        //let mut exchanges: HashMap<&str, proposal::Exchange> = HashMap::new();
                        for exchange in payload.get_exchanges() {
                            //exchanges.insert(exchange.get_sell_proposal_id(), exchange.clone());
                        //}
                        //for (sell_proposal_id, exchange) in exchanges {
                            let mut new_exchange = proposal::Exchange::new();
                            new_exchange.set_buy_proposal_id(exchange.get_buy_proposal_id().to_string());
                            new_exchange.set_sell_proposal_id(exchange.get_sell_proposal_id().to_string());
                            new_exchange.set_timestamp(exchange.get_timestamp());
                            new_exchange.set_currency_iso_codes(exchange.get_currency_iso_codes().to_string());
                            new_exchange.set_last_currency_price(exchange.get_last_currency_price());
                            new_exchange.set_last_dgc_price(exchange.get_last_dgc_price());
                            state.set_exchange(exchange.get_buy_proposal_id(), exchange.get_sell_proposal_id(), new_exchange)?;
                        }

                        let dg_coin_exchanged = current_proposal.get_dg_coin_exchanged();
                        current_proposal.set_dg_coin_exchanged(dg_coin_exchanged+dg_coin_amount);
                        current_proposal.set_status(proposal::Proposal_Status::CLOSED);
                        state.set_proposal(proposal_id, current_proposal)?;
                    }
                    proposal::Proposal_Role::creditDGC => {}
                    proposal::Proposal_Role::transferDGC => {}
                }
            }
            payload::AnswerProposalAction_Response::ACCEPT => {
 
                if current_proposal.get_receiving_participant() != signer {
                    return Err(ApplyError::InvalidTransaction(String::from(
                        "Only the receiving participant can Accept a proposal",
                    )));
                };

                let mut r_participant = match state.get_participant(&receiving_participant) {
                    Ok(Some(participant)) => participant.clone(),
                    Ok(None) => {
                        return Err(ApplyError::InvalidTransaction(format!(
                            "Receiving participant does not exist: {}",
                            receiving_participant
                        )))
                    }
                    Err(err) => return Err(err),
                };

                match role {
                    proposal::Proposal_Role::creditDGC => {
                        // To increase the dg_coin_credit for receiving_participant
                        let r_credit = match r_participant.clone().dg_coin_credits.last() {
                            Some(credit) => credit.clone(),
                            None => participant::Participant_CreditBalance::new(),
                        };
                        let r_dg_coin_credit = r_credit.get_dg_coin_amount();

                        let mut new_credit = participant::Participant_CreditBalance::new();
                        new_credit.set_proposal_id(proposal_id.to_string());
                        new_credit.set_timestamp(timestamp);
                        new_credit.set_dg_coin_amount(r_dg_coin_credit + dg_coin_amount);
                        r_participant.dg_coin_credits.push(new_credit);
                        state.set_participant(&receiving_participant, r_participant.clone())?;

                        current_proposal.set_status(proposal::Proposal_Status::ACCEPTED);
                        state.set_proposal(proposal_id, current_proposal)?;
                    }
                    proposal::Proposal_Role::buyDGC => {}
                    proposal::Proposal_Role::sellDGC => {}
                    proposal::Proposal_Role::transferDGC => {
                        // To decrease the dg_coin_balance for issuing_participant(transfer out)
                        let mut new_i_balance = match i_participant.clone().dg_coin_balances.last() {
                            Some(balance) => balance.clone(),
                            None => participant::Participant_CreditBalance::new(),
                        };
                        let i_dg_coin_balance = new_i_balance.get_dg_coin_amount();

                        if i_dg_coin_balance < dg_coin_amount {
                            return Err(ApplyError::InvalidTransaction(format!(
                                "The dg coin balance of issuving participant is not enough: {}",
                                signer
                            )))
                        }

                        new_i_balance.set_proposal_id(proposal_id.to_string());
                        new_i_balance.set_timestamp(timestamp);
                        new_i_balance.set_dg_coin_amount(i_dg_coin_balance - dg_coin_amount);
                        i_participant.dg_coin_balances.push(new_i_balance);
                        state.set_participant(signer, i_participant.clone())?;

                        // To increse the dg_coin_balance for receiving_participant(transfer in)
                        let mut new_r_balance = match r_participant.clone().dg_coin_balances.last() {
                            Some(balance) => balance.clone(),
                            None => participant::Participant_CreditBalance::new(),
                        };
                        let r_dg_coin_balance = new_r_balance.get_dg_coin_amount();
                        
                        new_r_balance.set_proposal_id(proposal_id.to_string());
                        new_r_balance.set_timestamp(timestamp);
                        new_r_balance.set_dg_coin_amount(r_dg_coin_balance + dg_coin_amount);
                        r_participant.dg_coin_balances.push(new_r_balance);
                        state.set_participant(&receiving_participant, r_participant.clone())?;

                        current_proposal.set_status(proposal::Proposal_Status::ACCEPTED);
                        state.set_proposal(proposal_id, current_proposal)?;
                    }
                    proposal::Proposal_Role::transferOwnership => {
                        let mut proposal_record = match state.get_record(record_id) {
                            Ok(Some(record)) => record,
                            Ok(None) => {
                                return Err(ApplyError::InvalidTransaction(format!(
                                    "Record in proposal does not exist: {}",
                                    record_id
                                )))
                            }
                            Err(err) => return Err(err),
                        };

                        let owner = match proposal_record.clone().owners.last() {
                            Some(owner) => owner.clone(),
                            None => {
                                return Err(ApplyError::InvalidTransaction(String::from(
                                    "Owner not found",
                                )))
                            }
                        };
/*
                        if owner.get_participant_id() != current_proposal.get_issuing_participant() {
                            current_proposal.set_status(proposal::Proposal_Status::CANCELED);
                            info!("Record owner does not match the issuing participant of the proposal");
                            state.set_proposal(proposal_id, current_proposal)?;
                            return Err(ApplyError::InvalidTransaction(String::from(
                                "Record owner does not match the issuing participant of the proposal",
                            )))
                        }
*/
                        let mut new_owner = record::Record_AssociatedParticipant::new();
                        new_owner.set_participant_id(receiving_participant.to_string());
                        new_owner.set_timestamp(timestamp);
                        proposal_record.owners.push(new_owner);
                        state.set_record(record_id, proposal_record.clone())?;

                        let table =
                            match state.get_table(proposal_record.get_table()) {
                                Ok(Some(table)) => table,
                                Ok(None) => {
                                    return Err(ApplyError::InvalidTransaction(format!(
                                        "Table does not exist: {}",
                                        proposal_record.get_table()
                                    )))
                                }
                                Err(err) => return Err(err),
                            };

                        for prop_schema in table.get_properties() {
                            let mut prop =
                                match state.get_property(record_id, prop_schema.get_name()) {
                                    Ok(Some(prop)) => prop,
                                    Ok(None) => {
                                        return Err(ApplyError::InvalidTransaction(String::from(
                                            "Property does not exist",
                                        )))
                                    }
                                    Err(err) => return Err(err),
                                };

                            let mut authorized = false;
                            let mut new_reporters: Vec<
                                property::Property_Reporter,
                            > = Vec::new();
                            let temp_prob = prop.clone();
                            let reporters = temp_prob.get_reporters();
                            for reporter in reporters {
                                if reporter.get_public_key() == owner.get_participant_id() {
                                    let mut new_reporter = reporter.clone();
                                    new_reporter.set_authorized(false);
                                    new_reporters.push(new_reporter);
                                } else if reporter.get_public_key() == receiving_participant {
                                    let mut new_reporter = reporter.clone();
                                    new_reporter.set_authorized(true);
                                    authorized = true;
                                    new_reporters.push(new_reporter);
                                } else {
                                    new_reporters.push(reporter.clone());
                                }
                            }

                            if !authorized {
                                let mut reporter = property::Property_Reporter::new();
                                reporter.set_public_key(receiving_participant.to_string());
                                reporter.set_authorized(true);
                                reporter.set_index(prop.reporters.len() as u32);
                                new_reporters.push(reporter);
                            }

                            prop.set_reporters(RepeatedField::from_vec(new_reporters));
                            state.set_property(record_id, prop.get_name(), prop.clone())?;
                        }
                        current_proposal.status = proposal::Proposal_Status::ACCEPTED;
                        state.set_proposal(proposal_id, current_proposal)?;
                    }
                    proposal::Proposal_Role::transferCustodianship => {
                        let mut proposal_record = match state.get_record(record_id) {
                            Ok(Some(record)) => record,
                            Ok(None) => {
                                return Err(ApplyError::InvalidTransaction(format!(
                                    "Record in proposal does not exist: {}",
                                    record_id
                                )))
                            }
                            Err(err) => return Err(err),
                        };

                        let custodian = match proposal_record.clone().custodians.last() {
                            Some(custodian) => custodian.clone(),
                            None => {
                                return Err(ApplyError::InvalidTransaction(String::from(
                                    "Custodian not found",
                                )))
                            }
                        };
/*                        
                        if custodian.get_participant_id() != current_proposal.get_issuing_participant() {
                            current_proposal.set_status(proposal::Proposal_Status::CANCELED);
                            info!("Record custodian does not match the issuing participant of the proposal");
                            state.set_proposal(proposal_id, current_proposal)?;
                            return Err(ApplyError::InvalidTransaction(String::from(
                                "Record custodian does not match the issuing participant of the proposal",
                            )))
                        }
*/
                        let mut new_custodian = record::Record_AssociatedParticipant::new();
                        new_custodian.set_participant_id(receiving_participant.to_string());
                        new_custodian.set_timestamp(timestamp);
                        proposal_record.custodians.push(new_custodian.clone());
                        state.set_record(record_id, proposal_record)?;
                        current_proposal.status = proposal::Proposal_Status::ACCEPTED;
                        state.set_proposal(proposal_id, current_proposal)?;
                    }
                    proposal::Proposal_Role::authorizeReporter => {
                        let proposal_record = match state.get_record(record_id) {
                            Ok(Some(record)) => record,
                            Ok(None) => {
                                return Err(ApplyError::InvalidTransaction(format!(
                                    "Record in proposal does not exist: {}",
                                    record_id
                                )))
                            }
                            Err(err) => return Err(err),
                        };

                        let owner = match proposal_record.clone().owners.last() {
                            Some(owner) => owner.clone(),
                            None => {
                                return Err(ApplyError::InvalidTransaction(String::from(
                                    "Owner not found",
                                )))
                            }
                        };
/*
                        if owner.get_participant_id() != current_proposal.get_issuing_participant() {
                            current_proposal.set_status(proposal::Proposal_Status::CANCELED);
                            info!("Record owner does not match the issuing participant of the proposal");
                            state.set_proposal(proposal_id, current_proposal)?;
                            return Err(ApplyError::InvalidTransaction(String::from(
                                "Record owner does not match the issuing participant of the proposal",
                            )))
                        }
*/
                        let mut reporter = property::Property_Reporter::new();
                        reporter.set_public_key(receiving_participant.to_string());
                        reporter.set_authorized(true);

                        for prop_name in current_proposal.get_properties() {
                            let mut prop = match state.get_property(record_id, prop_name) {
                                Ok(Some(prop)) => prop,
                                Ok(None) => {
                                    return Err(ApplyError::InvalidTransaction(String::from(
                                        "Property does not exist",
                                    )))
                                }
                                Err(err) => return Err(err),
                            };
                            reporter.set_index(prop.reporters.len() as u32);
                            prop.reporters.push(reporter.clone());
                            state.set_property(record_id, prop_name, prop)?;
                        }
                        current_proposal.status = proposal::Proposal_Status::ACCEPTED;
                        state.set_proposal(proposal_id, current_proposal)?;
                    }
                }
            }
        }
        //state.set_proposal(proposal_id, current_proposal)?;

        Ok(())
    }

    fn _revoke_reporter(
        &self,
        payload: payload::RevokeReporterAction,
        mut state: StateDGC,
        signer: &str,
    ) -> Result<(), ApplyError> {
        let record_id = payload.get_record_id();
        let reporter_id = payload.get_reporter_id();
        let properties = payload.get_properties();

        let revoke_record = match state.get_record(record_id) {
            Ok(Some(record)) => record,
            Ok(None) => {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Record does not exists: {}",
                    record_id
                )))
            }
            Err(err) => return Err(err),
        };

        let owner = match revoke_record.owners.last() {
            Some(x) => x,
            None => {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "Owner was not found",
                )))
            }
        };

        if owner.get_participant_id() != signer {
            return Err(ApplyError::InvalidTransaction(format!(
                "Must be owner to revoke reporters"
            )));
        }

        if revoke_record.get_field_final() {
            return Err(ApplyError::InvalidTransaction(format!(
                "Record is final: {}",
                record_id
            )));
        }

        for prop_name in properties {
            let mut prop = match state.get_property(record_id, prop_name) {
                Ok(Some(prop)) => prop,
                Ok(None) => {
                    return Err(ApplyError::InvalidTransaction(format!(
                        "Property does not exists"
                    )))
                }
                Err(err) => return Err(err),
            };

            let mut new_reporters: Vec<property::Property_Reporter> = Vec::new();
            let mut revoked = false;
            for reporter in prop.get_reporters() {
                if reporter.get_public_key() == reporter_id {
                    if !reporter.get_authorized() {
                        return Err(ApplyError::InvalidTransaction(format!(
                            "Reporter is already unauthorized."
                        )));
                    }
                    let mut unauthorized_reporter = reporter.clone();
                    unauthorized_reporter.set_authorized(false);
                    revoked = true;
                    new_reporters.push(unauthorized_reporter);
                } else {
                    new_reporters.push(reporter.clone());
                }
            }
            if !revoked {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Reporter cannot be revoked: {}",
                    reporter_id
                )));
            }
            prop.set_reporters(RepeatedField::from_vec(new_reporters));

            state.set_property(record_id, prop_name, prop)?;
        }

        Ok(())
    }

    fn _make_new_reported_value(
        &self,
        reporter_index: u32,
        timestamp: u64,
        value: &property::PropertyValue,
        property: &property::Property,
    ) -> Result<property::PropertyPage_ReportedValue, ApplyError> {
        let mut reported_value = property::PropertyPage_ReportedValue::new();
        reported_value.set_reporter_index(reporter_index);
        reported_value.set_timestamp(timestamp);

        match value.get_data_type() {
            property::PropertySchema_DataType::TYPE_UNSET => {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "DataType is not set",
                )))
            }
            property::PropertySchema_DataType::BYTES => {
                reported_value.set_bytes_value(value.get_bytes_value().to_vec())
            }
            property::PropertySchema_DataType::BOOLEAN => {
                reported_value.set_boolean_value(value.get_boolean_value())
            }
            property::PropertySchema_DataType::NUMBER => {
                reported_value.set_number_value(value.get_number_value())
            }
            property::PropertySchema_DataType::STRING => {
                reported_value.set_string_value(value.get_string_value().to_string())
            }
            property::PropertySchema_DataType::ENUM => {
                let enum_name = value.get_enum_value().to_string();
                let enum_index = match property.enum_options.iter()
                    .position(|name| name == &enum_name) {
                        Some(index) => index,
                        None => {
                            return Err(ApplyError::InvalidTransaction(format!(
                                "Provided enum name is not a valid option: {}",
                                enum_name,
                            )))
                        }
                    };
                reported_value.set_enum_value(enum_index as u32)
            }
            property::PropertySchema_DataType::STRUCT => {
                match self._validate_struct_values(
                    &value.struct_values,
                    &property.struct_properties
                ) {
                    Ok(_) => (),
                    Err(e) => return Err(e),
                }

                let struct_values = RepeatedField::from_vec(value.get_struct_values().to_vec());
                reported_value.set_struct_values(struct_values)
            }
            property::PropertySchema_DataType::LOCATION => {
                reported_value.set_location_value(value.get_location_value().clone())
            }
        };
        Ok(reported_value)
    }

    fn _validate_struct_values(
        &self,
        struct_values: &RepeatedField<property::PropertyValue>,
        schema_values: &RepeatedField<property::PropertySchema>
    ) -> Result<(), ApplyError> {
        if struct_values.len() != schema_values.len() {
            return Err(ApplyError::InvalidTransaction(format!(
                "Provided struct does not match schema length: {:?} != {:?}",
                struct_values.len(),
                schema_values.len(),
            )))
        }

        for schema in schema_values.iter() {
            let value = match struct_values.iter().find(|val| val.name == schema.name) {
                Some(val) => val,
                None => return Err(ApplyError::InvalidTransaction(format!(
                    "Provided struct missing required property from schema: {}",
                    schema.name,
                )))
            };

            if value.data_type != schema.data_type {
                return Err(ApplyError::InvalidTransaction(format!(
                    "Struct property \"{}\" must have data type: {:?}",
                    schema.name,
                    schema.data_type,
                )))
            }

            if schema.data_type == property::PropertySchema_DataType::STRUCT {
                match self._validate_struct_values(
                    &value.struct_values,
                    &schema.struct_properties
                ) {
                    Ok(_) => (),
                    Err(e) => return Err(e),
                }
            }
        }

        Ok(())
    }
}

impl TransactionHandler for TransactionHandlerDGC {
    fn family_name(&self) -> String {
        return self.family_name.clone();
    }

    fn family_versions(&self) -> Vec<String> {
        return self.family_versions.clone();
    }

    fn namespaces(&self) -> Vec<String> {
        return self.namespaces.clone();
    }

    fn apply(
        &self,
        request: &TpProcessRequest,
        context: &mut TransactionContext,
    ) -> Result<(), ApplyError> {
        let payload = PayloadDGC::new(request.get_payload());
        let payload = match payload {
            Err(e) => return Err(e),
            Ok(payload) => payload,
        };
        let payload = match payload {
            Some(x) => x,
            None => {
                return Err(ApplyError::InvalidTransaction(String::from(
                    "Request must contain a payload",
                )))
            }
        };

        let signer = request.get_header().get_signer_public_key();
        let state = StateDGC::new(context);

        info!(
            "payload: {:?} {} {} {}",
            payload.get_action(),
            payload.get_timestamp(),
            request.get_header().get_inputs()[0],
            request.get_header().get_outputs()[0]
        );

        match payload.get_action() {
            Action::CreateParticipant(participant_payload) => {
                self._create_participant(participant_payload, state, signer, payload.get_timestamp())?
            }
            Action::CreateRecord(record_payload) => {
                self._create_record(record_payload, state, signer, payload.get_timestamp())?
            }
            Action::FinalizeRecord(finalize_payload) => {
                self._finalize_record(finalize_payload, state, signer)?
            }
            Action::CreateTable(table_payload) => {
                self._create_table(table_payload, state, signer)?
            }
            Action::UpdateProperties(update_properties_payload) => self._update_properties(
                update_properties_payload,
                state,
                signer,
                payload.get_timestamp(),
            )?,
            Action::CreateProposal(proposal_payload) => {
                self._create_proposal(proposal_payload, state, signer, payload.get_timestamp())?
            }
            Action::AnswerProposal(answer_proposal_payload) => self._answer_proposal(
                answer_proposal_payload,
                state,
                signer,
                payload.get_timestamp(),
            )?,
            Action::RevokeReporter(revoke_reporter_payload) => {
                self._revoke_reporter(revoke_reporter_payload, state, signer)?
            }
        }
        Ok(())
    }
}
