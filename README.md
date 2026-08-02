This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Visa Intelligent Commerce fit

```
Human purchase intent
→ Still Theirs pre-credential safety decision
→ Explicit human confirmation
→ Prava payment instruction
→ Visa Intelligent Commerce-enabled scoped credential
→ Merchant checkout
```

**Routine purchase**
- Deterministic decision: `APPROVE`.
- The user sees the payment instruction (merchant, maximum amount, purpose, one-purchase-only scope) before anything is sent anywhere.
- The user explicitly continues.
- Only then can a Prava session be created.
- Sandbox credential generation was verified.

**Unusual purchase**
- Deterministic decision: `REQUEST_TRUSTED_CONTACT`.
- No Prava session is created.
- No payment credential is created.
- A Linq perspective request may be sent without transferring authority.

**Integration disclosure**

Still Theirs does not call Visa APIs directly. It integrates Prava, which supports Visa Intelligent Commerce where available. Still Theirs adds a pre-credential intent-safety layer before the Prava payment flow.

**Limitation**

The demonstrated evidence covers sandbox verification and credential generation. It does not claim a real merchant capture, authorization, clearing, or settlement.

**Positioning**

Still Theirs strengthens Visa Intelligent Commerce one step earlier: before an agent-specific payment credential is requested, it evaluates whether the human intent behind the payment instruction is still trustworthy.
