# Cointrol Wallet — User Guide

---

## What Is the Cointrol Wallet?

The Cointrol Wallet is a digital wallet application that lets you send, receive, and manage digital tokens and coins on the blockchain. It is **non-custodial**, which means **you are always in full control of your own money** — Cointrol never holds your funds or your private keys. No one can access your assets except you.

The wallet you have been provided is a free wallet in a test environment and does not hold any value.  Do not use this wallet for any transaction on the Mainnet; it only exists on Sepolia.  This test version only provides one account per device/browser and the total number of transaction is limited to 100.  The test wallet will be credited with 100 FAKE coins for the purpose of using the wallet; these coins hold no real value.

This guide explains every feature in plain, straightforward language.

---

## Table of Contents

1. [Getting Started — Signing In](#1-getting-started--signing-in)
2. [The Home Screen — Your Portfolio](#2-the-home-screen--your-portfolio)
3. [Creating an Account (Folio)](#3-creating-an-account-folio)
4. [Sending Coins or Tokens](#4-sending-coins-or-tokens)
5. [Viewing Transaction History](#5-viewing-transaction-history)
6. [Your Address Book](#6-your-address-book)
7. [Managing Contacts](#7-managing-contacts)
8. [Managing Smart Contracts](#8-managing-smart-contracts)
9. [Managing Coins and Tokens](#9-managing-coins-and-tokens)
10. [Sharing and Scanning QR Codes](#10-sharing-and-scanning-qr-codes)
11. [Your Display Name and Profile](#11-your-display-name-and-profile)
12. [Receiving Coins and Tokens](#12-receiving-coins-and-tokens)
13. [Account Recovery](#13-account-recovery)
14. [Logging Out](#14-logging-out)
15. [Important Safety Information](#15-important-safety-information)

---

## 1. Getting Started — Signing In

### How to sign in

When you first open the app you will see the **Sign In** screen. You can log in using one of these existing accounts you already have:

- **Google**
- **GitHub**
- **X (formerly Twitter)**
- **Facebook**

Tap or click the button for the service you want to use. You will be taken through that service's standard login process. Once you are signed in, you will be brought back to the wallet automatically.

### First-time sign-in

The first time you sign in, the app will:

1. Ask you to read and accept the **Terms and Conditions**. You must accept these before using the app.
2. Automatically set up your wallet behind the scenes. This takes only a moment.

### Staying signed in

The app keeps you signed in between visits. However, for your security, if you have not done anything in the app for **30 minutes**, you will be automatically signed out.  You will also be signed out if you close the tab/window.

---

## 2. The Home Screen — Your Portfolio

After signing in you will arrive at the **Portfolio** screen. This is the dashboard. It shows all your accounts and the coins they hold.

### What you can see

- A list of all your token balances by account, each showing:
  - The account name you gave it
  - The coin or token symbol (for example, ETH or USDC)
  - The blockchain network it is on (for example, Ethereum or Sepolia)
  - Your current balance

### Sharing your address

Refer to [Your Display Name and Profile](#11-your-display-name-and-profile).

### Searching and sorting

If you have many accounts, you can:

- **Search** — type in the search box to find an account by name or address
- **Sort** — choose how you want your accounts ordered (by name, coin symbol, network, or creation date)
- **Filter by tag** — if you have added tags to your accounts, you can show only accounts with certain tags

### Refreshing your balances

Your balances load automatically when you open the screen. If you want to manually check for the latest figures, tap the **Refresh** button.

---

## 3. Creating an Account (Folio)

Each account in Cointrol is called a **folio**. A folio is your own personal smart contract wallet on the blockchain. You can have more than one folio, for example one for everyday spending and one for savings.

### How to create a folio

1. On the dashboard, tap **Create account**.
2. A window will appear asking you to give the account a name (for example, "My Main Wallet" or "Savings").
3. Tap **Create**. The app will set up your account on the blockchain — this may take a few moments.
4. Once created, the account will appear on the dashboard.

> **Note**: Creating an account involves a blockchain transaction. This is handled automatically by the app.

### Editing an account name

1. Find the account in your portfolio list.
2. Tap the menu (usually three dots or an arrow) next to the account.
3. Choose **Edit label** and type the new name.

### Deleting an account

1. Tap the menu next to any of the entries for the account.
2. Choose **Remove account**.
3. You will see a warning message. Read it carefully — **removing an account from the app does not send your coins anywhere; however, you should make sure you have no remaining balance before deleting, or you may lose access to those funds.**
4. Confirm to proceed.

---

## 4. Sending Coins or Tokens

You can send coins or tokens from any of your folios to another address.

### How to send coins

1. Tap **Transactions** in the navigation menu.
2. Tap the **Send coins** button, it will default to the **transfer** function.
3. Fill in the following:

   **From** — choose which of your folios (accounts) you are sending from.  If you only have one folio, it will automatically default to that.

   **Coin** — choose which coin or token you want to send.

   **To** (the recipient):
   - **Manual** — type or paste the recipient's wallet address
   - **Address book** — choose from an address you have already saved (both contacts and smart contracts)
   - **Coins** — not relevant for sending coins unless the coin has a swap type function that requires an allowance approval.
   - **Folio** — send to one of your own accounts.

   **Amount** — enter how many coins you want to send.

4. Tap **Submit**. The app will ask you to confirm.
5. The transaction is signed and sent. You will see a status update as it is processed.

> **Important**: Blockchain transactions are **permanent and cannot be reversed**. Always double-check the recipient address before confirming.

### Approving spending

Some transactions require you to first give a coin contract "permission" to spend your tokens on your behalf (common with decentralised exchanges and other apps). This is called an **approval**. The process is the same as sending — choose the **Approve** function instead of **Transfer**.  You can also provide approvals for your contacts to grant them the ability to spend some of your coins.

### Calling a smart contract function

Advanced users can also interact directly with smart contracts. On the Transactions screen:

1. Click the **Use a smart contract** button
2. Select from any of the smart contracts you have saved in your contracts list.
3. Select the function you want to call.
4. Fill in any required parameters.  Any fields with an **address** type will automatically provide a selector that allows you to manually enter an address or select from your folios, address book, or coins.
5. Tap **Submit**.

You can also call **read-only** functions (these do not cost anything and do not change the blockchain) to check information such as a balance or a setting on a contract.  These do not use any of the credited transactions to the account.

---

## 5. Viewing Transaction History

On the **Transactions** screen, below the send form, you will find a list of all your past transactions.

Each entry shows:

- Which folio (account) sent the transaction
- Which coin or token was involved
- The network it was sent on
- The recipient address (and their name if they are in your address book)
- The transaction ID (called a "hash") — a unique reference for that transaction
- A **View on Explorer** button that takes you to a public website where you can see the full details of that transaction on the blockchain

### Searching and filtering

- **Search** — find a transaction by its hash
- **Sort** — order by name, symbol, address, network, or date
- **Filter by network** — show only transactions from a specific blockchain

### Refreshing pending transactions

If a transaction is still being processed, tap **Refresh TX Hashes** to check whether it has been confirmed yet.

---

## 6. Your Address Book

The **Address Book** is where you save addresses that you regularly use with short cuts for sending coins and using smart contract functions.

### What is shown

Each saved address displays:
- The name you gave it
- Which network it is on
- Any tags you have added

### What you can do

- **Search** — find an address by name or the address itself
- **Sort** — by name or by when it was added
- **Filter by tag** — show only addresses with certain tags
- **Reorder** — drag entries to your preferred order
- **Hide** — temporarily hide an address without deleting it, you can set it back to **Show** in the contact page or the smart contract page depending on what type of address it is.
- **Send** — tap the Send button next to an address to go straight to the send form with that address already filled in.  The button is disabled until a coin is selected in the selector next to this button.
- **Approve** — start an approval transaction for that address.  This button is also disabled until a coin is selected.
- **Use** a smart contract function — if the address is a smart contract, interact with it directly by selecting a function from the selector and then clicking the **Use** button.

Address book entries are created automatically when you add contacts or contracts.

---

## 7. Managing Contacts

The **Contacts** screen is where you store the details of people you send to, similar to a phone's contact list.

### What a contact contains

- First name (required)
- Surname (optional)
- One or more wallet addresses (you can save addresses for different networks)
- Tags (words you choose to help organise your contacts)

### Adding a contact

1. Go to **Contacts** from the menu.
2. Tap **Add Contact**.
3. Fill in the name and at least one wallet address.
4. Optionally add tags (for example "family", "work", "friends").
5. Tap **Save**.

### Editing or deleting a contact

Tap the contact in the list and choose **Edit** or **Delete**.

### Showing and hiding contacts

You can hide a contact from the address book without deleting them. Tap the **Action** button and toggle their visibility.

### Sharing a contact

Tap the **Share** button on a contact to generate a QR code. Another person can scan this QR code with the Cointrol app to instantly save the contact details.

### Searching and sorting

- Search by name or wallet address
- Sort by first name, surname, or creation date

---

## 8. Managing Smart Contracts

A **smart contract** is a program that lives on the blockchain. This screen lets you save the details of contracts you interact with regularly.

> Most everyday users will not need this feature. It is mainly for people who use decentralised apps (dApps) or who need to interact with specific blockchain programs.

### What a saved contract contains

- A name you give it
- The contract's address on the blockchain
- Which network it is on
- The contract's ABI (a technical file that describes what the contract can do — you can paste this in if you have it).  This field is optional but the **Use a smart contract** functionality will not work without this information.
- Tags

### Adding a contract

1. Go to **Contracts** from the menu.
2. Tap **Add Contract**.
3. Enter the name, address, and network. Optionally paste in the ABI.
4. Tap **Save**.

Once saved, the contract will also appear in your **Address Book** and can be used from the **Transactions** screen.

### Sharing a contract

Tap **Share** to generate a QR code with the contract details. Others can scan it to save the same contract. If the ABI is too large, it may be excluded in the sharing.

---

## 9. Managing Coins and Tokens

The **Coins** screen lets you track which tokens and coins are tracked in your wallet for sending and checking balances.

### Types of tokens supported

- **NATIVE** — the native currency of the network (for example, ETH on Ethereum)
- **ERC-20** — the most common type of token (for example, USDC, DAI)
- **ERC-721** — unique digital collectibles (NFTs)
- **ERC-1155** — a flexible token standard that can represent both unique and multiple-copy items
- Other advanced standards

### Adding a token

1. Go to **Coins** from the menu.
2. Tap **Add Coin**.
3. Enter the contract address of the token.
4. Tap **Look up** — the app will automatically fetch the token's name, symbol, and decimal places from the blockchain.
5. Check the details are correct, then tap **Save**.

### Editing or deleting a token

Tap the token in the list and choose **Edit** or **Delete**. Note: native tokens and some tokens are included by default and cannot be edited except for their tags.

### Searching and sorting

- Search by name, symbol, or address
- Sort by name, symbol, network, or date
- Filter by token type or network

---

## 10. Sharing and Scanning QR Codes

QR codes are square patterns that can be scanned with a camera to transfer information instantly.

### Scanning a QR code

Tap the **Scan** button in the top navigation bar. Point your camera at the QR code. The app will read it and automatically import the information (for example, a coin, contact, or contract).

### Generating QR codes

You can generate a QR code from:

- **Your profile** — share your display name and all your account addresses
- **A contact** — share a contact's details so someone else can save them
- **A contract** — share a contract's address and ABI
- **A coin** — share a token's details

Look for the **Share** button on the relevant screen to create a QR code.

---

## 11. Your Display Name and Profile

You can set a **display name** — a name that others will see when you share your profile with them.

### Setting your display name

On the Portfolio screen, tap the display name area (or an edit icon near your profile). Type a name of at least two characters and save it.

### Sharing your profile

Tap **Share Profile** on the Portfolio screen to generate a QR code containing your display name and all your wallet account addresses. Others can scan this to save your contact details.

---

## 12. Receiving Coins and Tokens

To receive coins or tokens, you simply need to share your wallet address with the sender. You do not need to do anything to "accept" a transfer — it will appear in your balance automatically once the transaction is confirmed on the blockchain.

### Finding your address

Each folio (account) has its own unique address on the blockchain. To find it:

1. On the **Portfolio** screen, locate the folio you want to receive into.
2. Tap the folio to open its details.
3. Your wallet address is displayed and can be copied to the clipboard with the **Copy** button.

### Sharing your address

- **Copy and paste** — copy the address and send it via message, email, or any other means.
- **QR code** — tap **Share Profile** on the Portfolio screen to generate a QR code. The sender can scan this with the Cointrol app or any compatible wallet to get your address instantly.

> **Important**: Always double-check the address you share. Sending coins to a wrong address cannot be reversed.

### Checking an incoming balance

Your balances refresh automatically when you open the Portfolio screen. Tap **Refresh** to manually check for the latest figures if you are waiting on an incoming payment.

---

## 13. Account Recovery

Because Cointrol is a **non-custodial** wallet, your signing keys are stored on your device and tied to your social login account. Cointrol does not hold a copy of your keys. If you delete the site data, you will lose access to the account.  A recoverability will be available soon but is not yet available for the current test accounts.

---

## 14. Logging Out

To sign out of the app:

1. Tap the **Menu** icon in the top navigation bar.
2. Choose **Logout**.

You will be returned to the sign-in screen. Your data is saved and will be available next time you sign in.

> The app will also log you out automatically after 30 minutes of inactivity for security.

---

## 15. Important Safety Information

### Your keys, your coins

Cointrol is a **non-custodial wallet**. This means:

- Your private signing keys are stored only on your device
- Cointrol has no way to access your funds
- If you lose your device and have not set up recovery, you may lose access to your wallet

### Transactions cannot be undone

Blockchain transactions are **permanent**. Once you send coins to an address, the transaction cannot be reversed. Always check the recipient address carefully before confirming.

### Keep your login secure

Your wallet is tied to your social login account (Google, GitHub, etc.). Keep that account secure with a strong password and two-factor authentication.

### Phishing warning

Only use the official Cointrol app. Be suspicious of anyone asking for your login details or any "seed phrase" or "recovery phrase" — the Cointrol wallet does not use seed phrases and Cointrol staff will never ask for your login credentials.

---

*This guide covers all features currently available in the Cointrol Wallet. If you have questions or encounter a problem, please contact support.*
