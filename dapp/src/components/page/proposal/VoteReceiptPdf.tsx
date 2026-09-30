import { Document, Page, View } from "@formepdf/react";
import { Heading } from "components/pdf/heading";
import { KeyValue } from "components/pdf/key-value";
import { Section } from "components/pdf/section";
import { Text } from "components/pdf/text";
import type { VoteReceipt } from "types/proposal";

const mono = { fontFamily: "Courier", fontSize: 9 };

const Code = ({ value }: { value: string }) => (
  <View
    wrap={false}
    style={{
      backgroundColor: "#f4f4f5",
      borderRadius: 4,
      marginBottom: 6,
      padding: 6,
    }}
  >
    <Text noMargin style={mono}>
      {value}
    </Text>
  </View>
);

const Values = ({ label, values }: { label: string; values: string[] }) => (
  <Section spacing="sm">
    <Text weight="bold" noMargin>
      {label}
    </Text>
    {values.map((value, i) => (
      <Code key={i} value={value} />
    ))}
  </Section>
);

export const VoteReceiptDocument = ({
  receipt,
  issuedAt,
}: {
  receipt: VoteReceipt;
  issuedAt: Date;
}) => (
  <Document
    title={`Tansu vote receipt: ${receipt.projectName} #${receipt.proposalId}`}
    author="Tansu"
    lang="en"
  >
    <Page size="A4" margin={48}>
      <Text variant="sm" color="#71717a" noMargin>
        Tansu · {issuedAt.toISOString().replace("T", " ").slice(0, 19)} UTC
      </Text>
      <Heading level={2}>Vote Receipt</Heading>
      <Text variant="sm" color="#71717a">
        {receipt.isPublicVoting
          ? "Your vote was public. You can check the transaction hash on a Stellar explorer to verify it is on-chain."
          : "Your vote was anonymous. Keep this receipt safe. You can verify your commitment on-chain using the transaction hash. At the end of the vote, the tally can be checked by verifying all commitments against the encrypted votes."}
      </Text>

      <Section spacing="md">
        <KeyValue
          divided
          items={[
            { key: "Project", value: receipt.projectName },
            { key: "Proposal ID", value: String(receipt.proposalId) },
            {
              key: "Vote Type",
              value:
                receipt.voteType.charAt(0).toUpperCase() +
                receipt.voteType.slice(1),
            },
            { key: "Weight", value: receipt.weight.toLocaleString() },
            {
              key: "Voting Type",
              value: receipt.isPublicVoting ? "Public" : "Anonymous",
            },
          ]}
        />
      </Section>

      {receipt.transactionHash && (
        <Values label="Transaction Hash" values={[receipt.transactionHash]} />
      )}
      {!receipt.isPublicVoting && (
        <>
          {receipt.publicKey && (
            <Values label="Public Key" values={[receipt.publicKey]} />
          )}
          <Values
            label="Encrypted Votes (Approve, Reject, Abstain)"
            values={receipt.votes ?? []}
          />
          <Values label="Cryptographic Seeds" values={receipt.seeds ?? []} />
          <Values label="Commitments" values={receipt.commitments ?? []} />
        </>
      )}
    </Page>
  </Document>
);

export const voteReceiptFileName = (receipt: VoteReceipt) =>
  `tansu-vote-receipt-${receipt.projectName}-${receipt.proposalId}.pdf`;

export const renderVoteReceipt = async (receipt: VoteReceipt) => {
  const [{ init, renderDocument }, { default: wasmUrl }] = await Promise.all([
    import("@formepdf/core/worker"),
    import("@formepdf/core/pkg-web/forme_bg.wasm?url"),
  ]);
  await init(wasmUrl);
  return renderDocument(
    <VoteReceiptDocument receipt={receipt} issuedAt={new Date()} />,
  );
};
