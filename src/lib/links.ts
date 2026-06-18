// Donation / "trakteer op een koffie" details. The /steun page turns these into
// an EPC SEPA payment QR (client-side) that Belgian banking apps can scan to
// pre-fill an instant transfer — no provider account or fee on either side.
export const SUPPORT = {
  iban: 'BE32 2300 0431 4702', // beneficiary IBAN encoded into the QR
  name: "Barry d'Hoine", // beneficiary (account holder) name
  remittance: 'Rut Prono koffie', // default mededeling
  amounts: [3, 5, 10], // quick-pick amounts (€)
  defaultAmount: 5,
  // Optional Bancontact "groepspot" link (created once in the Payconiq by
  // Bancontact app: Ontvangen → Maak een groepspot aan → share the invite link).
  // When set, /steun shows a tappable "Trakteer via Bancontact" button that opens
  // the Bancontact app on mobile. It's a reusable pot (up to 30 contributors),
  // independent of the QR amount slider. Leave '' to hide the button.
  payLink: 'https://pay.bancontact.com/p2p/0d51f7bb-6186-451b-8eac-68ade307767c',
};

// Internal page the "Trakteer op een koffie" links point to.
export const SUPPORT_HREF = '/steun';
