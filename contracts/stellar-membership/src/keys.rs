use crate::{
    KeyTrait, StellarMembership, StellarMembershipArgs, StellarMembershipClient, errors, events,
    storage, types,
};
use soroban_sdk::{Address, Env, contractimpl, panic_with_error};

#[contractimpl]
impl KeyTrait for StellarMembership {
    fn rotate_key(e: &Env, token_id: u32, new_address: Address) {
        let from = storage::owner(e, token_id);
        from.require_auth();
        new_address.require_auth();

        storage::cancel_recovery(e, token_id);
        storage::set_owner(e, token_id, Some(from.clone()), &new_address);
        storage::save_member(e, token_id, &storage::member(e, token_id));
        storage::extend_instance(e);

        events::KeyRotated {
            token_id,
            from,
            to: new_address,
        }
        .publish(e);
    }

    fn propose_recovery(e: &Env, token_id: u32, new_address: Address) {
        storage::attester(e).require_auth();
        new_address.require_auth();

        storage::owner(e, token_id);
        if Self::recovery(e, token_id).is_some() {
            panic_with_error!(e, errors::MembershipError::RecoveryPending)
        }
        if storage::token_of(e, &new_address).is_some() {
            panic_with_error!(e, errors::MembershipError::MemberAlreadyExist)
        }

        let executable_at = e.ledger().timestamp() + types::RECOVERY_DELAY;
        storage::write_recovery(
            e,
            token_id,
            &types::RecoveryRequest {
                new_address: new_address.clone(),
                executable_at,
            },
        );
        storage::extend_instance(e);

        events::RecoveryProposed {
            token_id,
            new_address,
            executable_at,
        }
        .publish(e);
    }

    fn cancel_recovery(e: &Env, caller: Address, token_id: u32) {
        storage::auth_owner_or_admin(e, &caller, token_id);

        if Self::recovery(e, token_id).is_none() {
            panic_with_error!(e, errors::MembershipError::NoRecovery)
        }
        storage::cancel_recovery(e, token_id);
    }

    fn finalize_recovery(e: &Env, token_id: u32) {
        let request = Self::recovery(e, token_id)
            .unwrap_or_else(|| panic_with_error!(e, errors::MembershipError::NoRecovery));
        // the admin can approve before the delay elapsed
        if e.ledger().timestamp() < request.executable_at {
            storage::admin(e).require_auth();
        }

        let from = storage::owner(e, token_id);
        e.storage()
            .persistent()
            .remove(&types::MemberKey::Recovery(token_id));
        storage::set_owner(e, token_id, Some(from.clone()), &request.new_address);
        storage::save_member(e, token_id, &storage::member(e, token_id));
        storage::extend_instance(e);

        events::Recovered {
            token_id,
            from: Some(from),
            to: request.new_address,
        }
        .publish(e);
    }

    fn recover(e: &Env, token_id: u32, new_address: Address) {
        storage::admin(e).require_auth();

        let mut member = storage::member(e, token_id);
        let from: Option<Address> = e
            .storage()
            .persistent()
            .get(&types::MemberKey::Owner(token_id));

        e.storage()
            .persistent()
            .remove(&types::MemberKey::Recovery(token_id));
        storage::set_owner(e, token_id, from.clone(), &new_address);
        member.status = types::Status::Active;
        storage::save_member(e, token_id, &member);
        storage::extend_instance(e);

        events::Recovered {
            token_id,
            from,
            to: new_address,
        }
        .publish(e);
    }

    fn recovery(e: &Env, token_id: u32) -> Option<types::RecoveryRequest> {
        e.storage()
            .persistent()
            .get(&types::MemberKey::Recovery(token_id))
    }
}
