import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  gitKeyListedQuery,
  memberQuery,
  parseProfile,
  profilePictureQuery,
} from "@service/MemberService";
import { queryClient } from "@service/queryClient";
import { isValidCid } from "utils/contentHashes";
import { getIpfsUrl, ipfsQuery } from "utils/ipfsFunctions";

/**
 * A member as the chain says, then their profile and picture from IPFS.
 * An edit keeps what it does not change, so it waits for both; the page
 * shows what the chain says meanwhile.
 */
export function useMemberProfile(address: string) {
  const memberRead = useQuery(
    { ...memberQuery(address), enabled: !!address },
    queryClient,
  );
  const member = memberRead.data ?? null;
  const cid = member && isValidCid(member.meta) ? member.meta : "";
  const profileRead = useQuery(
    {
      ...ipfsQuery(cid, "/profile.json"),
      select: parseProfile,
      enabled: !!cid,
    },
    queryClient,
  );
  const profile = profileRead.data ?? null;
  const pictureRead = useQuery(
    {
      ...profilePictureQuery(cid, profile?.image),
      enabled: profileRead.isSuccess,
    },
    queryClient,
  );
  const picture = pictureRead.data ?? null;
  const [pictureFailed, setPictureFailed] = useState(false);
  // A Git key the account lists now; the contract only checks the signature.
  const gitKeyListed = useQuery(
    {
      ...gitKeyListedQuery(
        member?.git_identity ?? "",
        member?.git_pubkey ?? new Uint8Array(),
      ),
      enabled: !!member?.git_identity && !!member.git_pubkey,
    },
    queryClient,
  );
  return {
    memberRead,
    member,
    cid,
    profileRead,
    profile,
    pictureRead,
    picture,
    pictureUrl: picture && !pictureFailed ? getIpfsUrl(cid, picture) : "",
    onPictureError: () => setPictureFailed(true),
    gitKeyListed,
    unreadable: profileRead.isError || pictureRead.isError,
  };
}
