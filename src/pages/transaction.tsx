import * as React from "react";
import { useTxnList } from "../hooks/useTransactionList";
import { Coin } from "@/storage/coinStore";
import { Contact } from "@/storage/contactStore";
import { useContacts } from "@/hooks/useContacts";
import { Contract } from "@/storage/contractStore";
import { useContracts } from "@/hooks/useContracts";
import { useCoinList } from "@/hooks/useCoinList";
import { Folio, Wallet } from "@/storage/folioStore"
import { Domain } from "@/storage/domainStore";
import { useDomains } from "@/hooks/useDomains";
import { useFolioList } from "@/hooks/useFolioList";
import { useAddressList } from "@/hooks/useAddressList";
import { useTx, BundlerAPI } from "@/lib/submitTransaction";
import { useLocation, useNavigate } from "react-router-dom";
import { Abi, encodeFunctionData, createPublicClient, http, type Hex, parseEther } from "viem";
import { parseAbiArg } from "@/lib/parseAbiArgs";
import {
  AbiFunctionFragment,
  getFunctions,
  getInputName,
  extractAbi,
  erc20Abi,
  erc721Abi,
  erc1155Abi,
  nativeAbi,
  quantumAccountAbi
} from "@/lib/abiTypes";
import { TxStatus } from "@/lib/submitTransaction";
import { createPortal } from "react-dom";
import { resolveEnsAddress, lookupEnsName } from "@/lib/ens";
import { fetchIncomingTransfers } from "@/lib/fetchIncomingTransfers";
import { upsertIncomingTxns } from "@/storage/transactionStore";

const ENS_REGEX = /^[a-z0-9-]+\.eth$/i;

export function Transactions() {

  type AddressMode = "manual" | "address" | "coin" | "folio";

  type AddressFieldState = {
    mode: AddressMode;
    // when mode === "manual"
    manual: string;
    // when mode !== "manual"
    selectedIndex: number | null; // index into the relevant array
  };

  type EnsResolution = {
    status: "resolving" | "resolved" | "not-found";
    resolvedAddress?: string;
  };

  const [addressFieldState, setAddressFieldState] = React.useState<Record<string, AddressFieldState>>({});
  const [ensResolutionState, setEnsResolutionState] = React.useState<Record<string, EnsResolution>>({});
  const ensDebounceTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState<"createdDesc" | "addressAsc" | "addressDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc" | "nameAsc" | "nameDesc" | "coinSymbolAsc" | "coinSymbolDesc">(
    "createdDesc"
  );
  const [chainId, setChainId] = React.useState<number>(0);

  const [cardTitle, setCardTitle] = React.useState<string>("");
  const [cardDescription, setCardDescription] = React.useState<string>("");

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [transferOrTransaction, setTransferOrTransaction] = React.useState(true);
  const [recStatus, setStatus] = React.useState<TxStatus | null>(null);
  const [selectCoin, setSelectCoin] = React.useState<Coin | null>(null);
  const [selectContact, setSelectContact] = React.useState<Contact | null>(null);
  const [selectContract, setSelectContract] = React.useState<Contract | null>(null);
  const [selectFolio, setSelectFolio] = React.useState<Folio | null>(null);
  const [selectDomain, setSelectDomain] = React.useState<Domain | null>(null);

  const [selectedFnName, setSelectedFnName] = React.useState<string>("");
  const [argValues, setArgValues] = React.useState<Record<string, string>>({});
  const [payableValue, setPayableValue] = React.useState<string>("");

  const [readResult, setReadResult] = React.useState<string | null>(null);
  const [formError, setError] = React.useState<string | null>(null);
  const [isReading, setIsReading] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);

  // ENS reverse-lookup cache for history display (non-blocking, not persisted)
  const [ensLookupCache, setEnsLookupCache] = React.useState<Record<string, string | null>>({});
  const pendingEnsLookups = React.useRef(new Set<string>());

  const location = useLocation();
  const navigate = useNavigate();
  const prefillHandled = React.useRef(false);
  const pendingPrefillFnRef = React.useRef("");
  const pendingAddressFieldRef = React.useRef<Record<string, AddressFieldState> | null>(null);


  const CHAIN_NAMES: Record<number, string> = {
    1: "Ethereum",
    11155111: "Sepolia",
  };

  const {
    txns,
    loading: loading,
    error: error,
    addTxn,
    deleteTxn,
    updateTxn,
  } = useTxnList({ query, sortMode, chainId });

  const {
    folios,
    loading: fLoading,
    error: fError,
    addFolio,
    deleteFolio,
    updateFolio,
  } = useFolioList({ query: "", sortMode: "createdAsc", chainId });

  const {
    coins,
    loading: cLoading,
    error: cError,
    addCoin,
    deleteCoin,
    updateCoin,
  } = useCoinList({ query: "", sortMode: "nameAsc", standard: "", chainId });

  const {
    address,
    loading: aLoading,
    error: aError,
    addAddress,
    deleteAddress,
    updateAddress,
  } = useAddressList({ query: "", sortMode: "nameAsc" });

  const {
    domains,
    loading: dLoading,
    error: dError,
    addDomain,
    deleteDomain,
    updateDomain,
  } = useDomains();

  const {
    contracts,
    loading: crLoading,
    error: crError,
    addContract,
    deleteContract,
    updateContract,
  } = useContracts();

  const {
    contacts,
    loading: coLoading,
    error: coError,
    addContact,
    deleteContact,
    updateContact,
  } = useContacts();

  // ENS mainnet RPC: prefer a user-configured domain with chainId=1, else cloudflare
  const mainnetRpcUrl = React.useMemo(() => {
    const mainnetDomain = domains.find(d => d.chainId === 1);
    return mainnetDomain?.rpcUrl ?? "https://cloudflare-eth.com";
  }, [domains]);

  function formatBalance(balance: bigint, decimals: number): string {
    if (decimals <= 0) return balance.toString();

    const negative = balance < 0n;
    const value = negative ? -balance : balance;

    const base = 10n;
    const factor = base ** BigInt(decimals);

    const integer = value / factor;
    const fraction = value % factor;

    let fractionStr = fraction.toString().padStart(decimals, "0");
    // trim trailing zeros in fraction part
    fractionStr = fractionStr.replace(/0+$/, "");

    const result =
      integer.toString() + (fractionStr.length > 0 ? "." + fractionStr : "");

    return negative ? "-" + result : result;
  }

  function getBalance(value = 0, decimals: number): bigint {
    if (decimals <= 0) return BigInt(value);
    if (value < 0) return BigInt(0);
    return BigInt(value * (10 ** decimals));
  }

  // --- Modal helpers ---------------------------------------------------------

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;

      // Ignore clicks inside any <details>
      if (target.closest("details")) return;

      // Close all open action menus
      document.querySelectorAll("details[open]").forEach(d => {
        d.removeAttribute("open");
      });
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!isModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isModalOpen]);

  React.useEffect(() => {
    if (!isModalOpen) return;
    if (folios.length === 1 && !selectFolio) {
      setSelectFolio(folios[0]);
    }
  }, [isModalOpen, folios, selectFolio]);

  React.useEffect(() => {
    if (prefillHandled.current) return;
    const prefill = location.state?.prefill as
      | { mode: 'transfer'; addressId: string; coinId: string; functionName?: string }
      | { mode: 'contract'; addressId: string; functionName: string }
      | undefined;
    if (!prefill) return;
    if (cLoading || coLoading || crLoading || fLoading || aLoading) return;

    prefillHandled.current = true;

    if (prefill.mode === 'transfer') {
      const coin = coins.find(c => c.id === prefill.coinId) ?? null;
      const contactId = prefill.addressId.replace(/^address:/, '');
      const contact = contacts.find(c => c.id === contactId) ?? null;
      const folio = folios.find(f => f.chainId === coin?.chainId) ?? null;
      const addrIdx = address.findIndex(a => a.id === prefill.addressId);

      setSelectCoin(coin);
      setSelectContact(contact);
      if (folio) setSelectFolio(folio);
      setTransferOrTransaction(true);
      setCardTitle("Send or Approve Coins");
      setCardDescription("Select any coin and then choose an option.");
      pendingPrefillFnRef.current = prefill.functionName ?? "transfer";
      setSelectedFnName("");
      if (addrIdx !== -1) {
        // "approve" uses "spender" as the address input key; all others use "to"
        const addrKey = prefill.functionName === "approve" ? "spender" : "to";
        pendingAddressFieldRef.current = { [addrKey]: { mode: 'address', manual: '', selectedIndex: addrIdx } };
      }
      setIsModalOpen(true);

    } else if (prefill.mode === 'contract') {
      const contractId = prefill.addressId.replace(/^address:/, '');
      const contract = contracts.find(c => c.id === contractId) ?? null;

      setSelectContract(contract);
      setTransferOrTransaction(false);
      setCardTitle("Use a Smart Contract");
      setCardDescription("Select any contract and then choose a function");
      if (prefill.functionName) pendingPrefillFnRef.current = prefill.functionName;
      setIsModalOpen(true);
    }
  }, [location.state, cLoading, coLoading, crLoading, fLoading, aLoading,
      coins, contacts, contracts, folios, address]);

  // Trigger non-blocking ENS reverse lookups for history addresses
  React.useEffect(() => {
    for (const txn of txns) {
      if (txn.direction === "incoming" && txn.fromAddress && !txn.ensFromName) {
        const addr = txn.fromAddress.toLowerCase();
        if (!(addr in ensLookupCache) && !pendingEnsLookups.current.has(addr)) {
          pendingEnsLookups.current.add(addr);
          lookupEnsName(addr as `0x${string}`, mainnetRpcUrl).then(name => {
            pendingEnsLookups.current.delete(addr);
            setEnsLookupCache(prev => ({ ...prev, [addr]: name }));
          });
        }
      }
      if (txn.direction === "outgoing" && txn.toAddress && !txn.ensToName) {
        const addr = txn.toAddress.toLowerCase();
        if (!(addr in ensLookupCache) && !pendingEnsLookups.current.has(addr)) {
          pendingEnsLookups.current.add(addr);
          lookupEnsName(addr as `0x${string}`, mainnetRpcUrl).then(name => {
            pendingEnsLookups.current.delete(addr);
            setEnsLookupCache(prev => ({ ...prev, [addr]: name }));
          });
        }
      }
    }
  }, [txns, mainnetRpcUrl]);

  function resetForm() {
    setSelectCoin(null);
    setSelectContact(null);
    setSelectContract(null);
    setSelectFolio(null);

    // clear dynamic input state
    setSelectedFnName("");
    setArgValues({});
    setAddressFieldState({});
    setEnsResolutionState({});
    setPayableValue("");

    // clear results and errors
    setReadResult(null);
    setError(null);
    setStatus(null);
  }

  function openContractTransaction() {
    resetForm();
    setTransferOrTransaction(false);
    setCardTitle("Use a Smart Contract");
    const newDescription = "Select any contract and then choose a function";
    setCardDescription(newDescription);
    setIsModalOpen(true);
  }

  function openTransferModal() {
    resetForm();
    setTransferOrTransaction(true);
    setCardTitle("Send or Approve Coins");
    const newDescription = "Select any coin and then choose an option.";
    setCardDescription(newDescription);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    resetForm();
  }

  function stringifyBigInt(value: unknown) {
    return JSON.stringify(
      value,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    );
  }

  // --- ENS resolution for address input fields ------------------------------

  async function resolveAddressField(key: string, value: string) {
    if (!ENS_REGEX.test(value.trim())) {
      setEnsResolutionState(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setEnsResolutionState(prev => ({ ...prev, [key]: { status: "resolving" } }));
    const resolved = await resolveEnsAddress(value.trim(), mainnetRpcUrl);
    setEnsResolutionState(prev => ({
      ...prev,
      [key]: resolved
        ? { status: "resolved", resolvedAddress: resolved }
        : { status: "not-found" },
    }));
  }

  function handleManualAddressChange(key: string, st: AddressFieldState, manual: string) {
    setAddressFieldState(prev => ({ ...prev, [key]: { ...st, manual } }));

    if (ensDebounceTimers.current[key]) {
      clearTimeout(ensDebounceTimers.current[key]);
    }
    ensDebounceTimers.current[key] = setTimeout(() => {
      resolveAddressField(key, manual);
    }, 600);
  }

  function handleManualAddressBlur(key: string, value: string) {
    if (ensDebounceTimers.current[key]) {
      clearTimeout(ensDebounceTimers.current[key]);
    }
    resolveAddressField(key, value);
  }

  // --- Address resolution (async for ENS support) ---------------------------

  async function getResolvedAddress(key: string): Promise<string> {
    const st = addressFieldState[key];

    if (!st) return "";

    if (st.mode === "manual") {
      const manual = (st.manual ?? "").trim();
      if (ENS_REGEX.test(manual)) {
        const resolved = await resolveEnsAddress(manual, mainnetRpcUrl);
        return resolved ?? "";
      }
      return manual;
    }

    const idx = st.selectedIndex;
    if (idx == null) return "";

    if (st.mode === "address") {
      const addrRow = address[idx];
      if (!addrRow) return "";

      if (addrRow.isContact) {
        const contactId = addrRow.id.replace(/^address:/, '');
        const contact = contacts.find(c => c.id === contactId);
        if (!contact?.wallets?.length) return "";

        const w = contact.wallets.find(w => w.chainId === selectDomain?.chainId);
        const addr = (w?.address ?? "").trim();
        if (ENS_REGEX.test(addr)) {
          const resolved = await resolveEnsAddress(addr, mainnetRpcUrl);
          return resolved ?? "";
        }
        return addr;
      } else {
        const contract = contracts.find(c => c.id === addrRow.id);
        const addr = (contract?.address ?? "").trim();
        if (ENS_REGEX.test(addr)) {
          const resolved = await resolveEnsAddress(addr, mainnetRpcUrl);
          return resolved ?? "";
        }
        return addr;
      }
    }
    if (st.mode === "coin") return (coins[idx]?.address ?? "").trim();
    if (st.mode === "folio") return (folios[idx]?.address ?? "").trim();

    return "";
  }

  function ensureAddressField(key: string) {
    // lazily initialize to avoid needing effects
    if (addressFieldState[key]) return;
    setAddressFieldState((prev) => ({
      ...prev,
      [key]: { mode: "manual", manual: "", selectedIndex: null },
    }));
  }

  async function handleSubmit(txStatus?: TxStatus, toAddress?: string, fromAddress?: string, amount?: string, functionName?: string, receiverAddress?: string) {
    var addressId;
    if (transferOrTransaction) {
      addressId = selectContact?.id;
    } else {
      addressId = selectContract?.id;
    }

    const wallet = selectFolio?.wallet;
    const walLen = wallet?.length
    var selectWallet = -1;
    if (selectCoin && walLen && walLen > 0) {
      for (let i = 0; i < walLen; i++) {
        if (wallet[i].coin == selectCoin.id) {
          selectWallet = i;
        }
      }
    }

    const activeStatus = txStatus ?? recStatus;

    // Capture ENS name if the "to" address field was an ENS name
    const toKey = "to";
    const toFieldState = addressFieldState[toKey];
    const ensToName =
      toFieldState?.mode === "manual" && ENS_REGEX.test((toFieldState.manual ?? "").trim())
        ? toFieldState.manual.trim()
        : undefined;

    const payload: any = {
      userOpHash: activeStatus?.userOpHash,
      transactionHash: activeStatus?.hash,
      chainId: selectFolio?.chainId,
      addressId: addressId,
      coinId: selectCoin?.id,
      folioId: selectFolio?.id,
      walletId: selectWallet,
      direction: "outgoing",
      toAddress,
      fromAddress,
      amount,
      ensToName,
      functionName,
      receiverAddress,
    };

    await addTxn({ ...payload });

    closeModal();
  }

  // --- Unified refresh: incoming transfers + outgoing tx hashes -------------

  async function handleRefresh() {
    setIsRefreshing(true);
    setRefreshError(null);

    const refreshErrors: string[] = [];

    // Step 1: fetch incoming transfers for each domain
    for (const domain of domains) {
      const domainFolios = folios
        .filter(f => f.chainId === domain.chainId)
        .map(f => ({ id: f.id, address: f.address }));

      if (domainFolios.length === 0) continue;

      try {
        const incoming = await fetchIncomingTransfers(
          domainFolios,
          domain.chainId,
          domain.rpcUrl,
          undefined,
          mainnetRpcUrl
        );
        if (incoming.length > 0) {
          await upsertIncomingTxns(incoming);
        }
      } catch (err: any) {
        refreshErrors.push(`Chain ${domain.chainId}: ${err?.message ?? "Unknown error"}`);
      }
    }

    // Step 2: re-query bundler for outgoing txns missing transactionHash
    try {
      const pending = txns.filter(t => t.direction !== "incoming" && !t.transactionHash);
      for (const txn of pending) {
        const folio = folios.find(f => f.id === txn.folioId);
        if (!folio?.address || !txn.userOpHash) continue;
        try {
          const rec = await BundlerAPI.getTxReceipt(
            folio.address as `0x${string}`,
            txn.userOpHash as `0x${string}`
          );
          if (rec.success && rec.txHash) {
            await updateTxn(txn.id, { transactionHash: rec.txHash });
          }
        } catch {
          // skip failed lookups, don't block others
        }
      }
    } catch (err: any) {
      refreshErrors.push(`Bundler: ${err?.message ?? "Unknown error"}`);
    }

    if (refreshErrors.length > 0) {
      setRefreshError(refreshErrors.join(" | "));
    }

    setIsRefreshing(false);
  }

  const abi: Abi | null = React.useMemo(() => {
    if (transferOrTransaction) {
      switch (selectCoin?.type) {
        case "ERC20":
          return erc20Abi;
        case "ERC721":
          return erc721Abi;
        case "ERC1155":
          return erc1155Abi;
        case "NATIVE":
          return nativeAbi;
        default:
          return erc20Abi;
      }
    } else {
      return extractAbi(selectContract?.metadata);
    }
  }, [selectCoin, transferOrTransaction, selectContract]);

  const coinBalance = React.useMemo(() => {
    if (selectCoin != null && selectFolio != null) {
      const wallets = selectFolio?.wallet;
      const walletCount = wallets?.length;
      var balance = 0n;
      if (walletCount && walletCount > 0) {
        for (let i = 0; i < walletCount; i++) {
          if (wallets[i].coin === selectCoin.id) {
            balance = wallets[i].balance;
          }
        }
      }
      return formatBalance(balance, selectCoin.decimals);
    } else return "";

  }, [selectCoin, selectFolio])

  const functions = React.useMemo(() => getFunctions(abi), [abi]);

  const isPayable = React.useMemo(() => {
    const fn = functions.find((f) => f.name === selectedFnName);
    return fn?.stateMutability === "payable";
  }, [functions, selectedFnName]);

  const submitDisabled =
  isReading ||
  (!transferOrTransaction && isPayable && !(payableValue || "").trim());

  const writeFunctions = React.useMemo(
    () =>
      functions.filter((f) => {
        if (f.stateMutability) return f.stateMutability === "nonpayable" || f.stateMutability === "payable";
        // Legacy ABI format: constant=false means write
        return !(f as any).constant;
      }),
    [functions]
  );

  const readFunctions = React.useMemo(
    () =>
      functions.filter((f) => {
        if (f.stateMutability) return f.stateMutability === "view" || f.stateMutability === "pure";
        // Legacy ABI format: constant=true means read
        return (f as any).constant === true;
      }),
    [functions]
  );

  React.useEffect(() => {
    if (!selectDomain && domains.length) setSelectDomain(domains[0]);
  }, [selectDomain, domains]);

  React.useEffect(() => {
    // Whenever contract changes, reset function selection
    setSelectedFnName("");
    setArgValues({});
    setPayableValue("");
    setReadResult(null);
    setError(null);
  }, [abi]);

  React.useEffect(() => {
    if (!selectedFnName && functions.length > 0) {
      if (pendingPrefillFnRef.current) {
        setSelectedFnName(pendingPrefillFnRef.current);
        pendingPrefillFnRef.current = "";
      } else if (transferOrTransaction) {
        setSelectedFnName("transfer");
      } else if (writeFunctions.length > 0) {
        // Prefer a write function first, otherwise any function.
        setSelectedFnName(writeFunctions[0].name);
      } else {
        setSelectedFnName(functions[0].name);
      }
    }
  }, [selectedFnName, functions, writeFunctions, transferOrTransaction]);

  React.useEffect(() => {
    if (!selectedFnName) return;

    // clear BOTH types of inputs whenever function changes
    setArgValues({});
    setPayableValue("");
    setEnsResolutionState({});
    if (pendingAddressFieldRef.current) {
      setAddressFieldState(pendingAddressFieldRef.current);
      pendingAddressFieldRef.current = null;
    } else {
      setAddressFieldState({});
    }
    setReadResult(null);
    setError(null);
  }, [selectedFnName]);

  const selectedFn: AbiFunctionFragment | undefined = React.useMemo(
    () => functions.find((f) => f.name === selectedFnName),
    [functions, selectedFnName]
  );

  function handleArgChange(paramKey: string, value: string) {
    setArgValues((prev) => ({ ...prev, [paramKey]: value }));
  }

  async function buildArgs(): Promise<unknown[]> {
    if (!selectedFn) return [];

    const results = await Promise.all(
      selectedFn.inputs.map(async (input, index) => {
        const key = getInputName(input, index);

        if (input.type === "address") {
          return await getResolvedAddress(key);
        }

        if (key === "value" && transferOrTransaction) {
          return getBalance(Number(argValues[key]), selectCoin?.decimals ?? 18);
        }

        const raw = argValues[key] ?? "";
        return parseAbiArg(input.type, raw);
      })
    );

    return results;
  }

  const { startFlow } = useTx();

  async function handleBuildCalldata() {
    setError(null);
    setReadResult(null);

    if (!abi) {
      setError("No ABI found for selected contract");
      return;
    }

    if (!selectContract && !transferOrTransaction) {
      setError("No contract selected");
      return;
    }

    if (isPayable && !(payableValue || "").trim()) {
      setError("Enter a payable value");
      return;
    }

    if (!selectCoin && transferOrTransaction) {
      setError("No token selected");
      return;
    }

    if (!selectedFn) {
      setError("No function selected");
      return;
    }

    if (isReading) return;

    try {
      setIsReading(true);

      const isNative = transferOrTransaction && selectCoin?.type === "NATIVE";

      let dest: `0x${string}` | null = null;

      // Build execute(value,data)
      let value: bigint = 0n;
      let innerData: Hex = "0x";

      if (isNative) {

        if (!selectedFn) {
          setError("No function selected");
          return;
        }

        const args = await buildArgs(); // expected: [_to, _value]

        const to = (args?.[0] as string | undefined)?.trim();
        const amount = args?.[1] as bigint | undefined;

        if (!to || !to.startsWith("0x")) {
          setError("Invalid _to address");
          return;
        }
        if (amount == null) {
          setError("Invalid _value amount");
          return;
        }

        dest = to as `0x${string}`;
        value = BigInt(amount);
        innerData = "0x";
      } else {
        // Non-native: encode the selected function against the selected ABI
        if (!abi) {
          setError("No ABI found");
          return;
        }
        if (!selectedFn) {
          setError("No function selected");
          return;
        }

        const args = await buildArgs();
        innerData = encodeFunctionData({
          abi,
          functionName: selectedFn.name,
          args,
        }) as Hex;

        if (transferOrTransaction) {
          // token call: dest = token contract address (resolve ENS if needed)
          const rawTokenAddr = (selectCoin?.address ?? "").trim();
          if (ENS_REGEX.test(rawTokenAddr)) {
            const resolved = await resolveEnsAddress(rawTokenAddr, mainnetRpcUrl);
            if (!resolved) {
              setError("Could not resolve ENS address for coin contract");
              return;
            }
            dest = resolved as `0x${string}`;
          } else if (!rawTokenAddr.startsWith("0x")) {
            setError("Coin has no valid contract address");
            return;
          } else {
            dest = rawTokenAddr as `0x${string}`;
          }
          value = 0n;
        } else {
          // contract call: dest = selected contract address
          const cAddr = (selectContract?.address ?? "").trim();
          if (!cAddr.startsWith("0x")) {
            setError("Contract has no valid address");
            return;
          }
          dest = cAddr as `0x${string}`;
          value = isPayable ? parseEther((payableValue || "0").trim()) : 0n;
        }
      }

      if (!dest) {
        setError("Could not resolve destination address");
        return;
      }

      // Wrap into QuantumAccount.execute(dest,value,innerData)
      const wrappedCalldata = encodeFunctionData({
        abi: quantumAccountAbi,
        functionName: "execute",
        args: [dest, value, innerData],
      }) as `0x${string}`;

      const _folio = selectFolio as Folio;
      const _domain = selectDomain as Domain;

      await startFlow({
        folio: _folio,
        encoded: wrappedCalldata,
        domain: _domain,
      });

      const currentStatus = useTx.getState().status;
      setStatus(currentStatus);

      if (currentStatus.phase === "failed") {
        setError(currentStatus.message ?? "Transaction failed");
        return;
      }

      // For token transfers/approvals, extract the actual recipient/spender
      // from the function args to store as receiverAddress. toAddress stays
      // as dest (EVM-level destination: coin contract for ERC-20, recipient for native).
      let receiverAddress: string | undefined;
      if (transferOrTransaction && !isNative && selectedFn) {
        for (let i = 0; i < selectedFn.inputs.length; i++) {
          const input = selectedFn.inputs[i];
          if (input.type !== "address") continue;
          const key = getInputName(input, i);
          if (key === "to" || key === "spender") {
            const resolved = await getResolvedAddress(key);
            if (resolved) receiverAddress = resolved;
            break;
          }
        }
      }

      handleSubmit(
        currentStatus,
        dest ?? undefined,
        selectFolio?.address ?? undefined,
        argValues["value"],
        selectedFnName,
        receiverAddress,
      );

    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Failed to build calldata");
    } finally {
      setIsReading(false);
    }
  }

  async function handleReadCall() {
    setError(null);
    setReadResult(null);

    if (!abi) {
      setError("No ABI found for selected contract");
      return;
    }

    if (!selectContract && !transferOrTransaction) {
      setError("No contract selected");
      return;
    }

    if (!selectCoin && transferOrTransaction) {
      setError("No token selected");
      return;
    }

    if (!selectedFn) {
      setError("No function selected");
      return;
    }

    const isReadOnly =
      selectedFn.stateMutability === "view" || selectedFn.stateMutability === "pure";

    if (!isReadOnly) {
      setError("Selected function is not read-only");
      return;
    }

    if (isReading) return;

    try {
      setIsReading(true);
      const args = await buildArgs();

      const client = createPublicClient({
        transport: http(selectDomain?.rpcUrl),
      });

      var resultAddress;
      if (transferOrTransaction) {
        resultAddress = selectCoin?.address as `0x${string}`;
      } else {
        resultAddress = selectContract?.address as `0x${string}`;
      }

      const result = await client.readContract({
        address: resultAddress,
        abi,
        functionName: selectedFn.name as any,
        args,
      });

      setReadResult(stringifyBigInt(result));

    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Failed to read from RPC");
    } finally {
      setIsReading(false);
    }
  }

  const isReadOnly =
    selectedFn &&
    (selectedFn.stateMutability === "view" || selectedFn.stateMutability === "pure");

  const hasAbi = !!abi && functions.length > 0;

  // --- Contact-from-transfer helpers ----------------------------------------

  function isSenderAlreadyContact(fromAddress: string, txnChainId: number, ensFromName?: string): boolean {
    return contacts.some(c =>
      c.wallets?.some(w =>
        w.chainId === txnChainId && (
          w.address.toLowerCase() === fromAddress.toLowerCase() ||
          (ensFromName ? w.address.toLowerCase() === ensFromName.toLowerCase() : false)
        )
      )
    );
  }

  function handleAddContact(txnChainId: number, fromAddress: string, ensFromName?: string) {
    const prefillAddress = ensFromName ?? fromAddress;
    navigate("/contacts", {
      state: {
        prefillContact: {
          prefillAddress,
          chainId: txnChainId,
        },
      },
    });
  }

  // --- Address display helper for history -----------------------------------

  function getAddressDisplay(
    addr: string | undefined,
    storedEnsName: string | undefined
  ): { primary: string; secondary?: string } {
    if (!addr) return { primary: "Unknown" };
    const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    const addrLower = addr.toLowerCase();

    // Check contacts (match by wallet address)
    const matchedContact = contacts.find(c =>
      c.wallets?.some(w => w.address.toLowerCase() === addrLower)
    );
    if (matchedContact) {
      const name = matchedContact.surname
        ? `${matchedContact.name} ${matchedContact.surname}`
        : matchedContact.name;
      return { primary: name, secondary: short };
    }

    // Check contracts
    const matchedContract = contracts.find(c => c.address.toLowerCase() === addrLower);
    if (matchedContract) return { primary: matchedContract.name, secondary: short };

    // Check coins
    const matchedCoin = coins.find(c => c.address.toLowerCase() === addrLower);
    if (matchedCoin) return { primary: matchedCoin.name, secondary: short };

    // Check folios
    const matchedFolio = folios.find(f => f.address.toLowerCase() === addrLower);
    if (matchedFolio) return { primary: matchedFolio.name, secondary: short };

    // Fall back to stored/cached ENS name, then short address
    if (storedEnsName) return { primary: storedEnsName, secondary: short };
    const cached = ensLookupCache[addrLower];
    if (cached) return { primary: cached, secondary: short };
    return { primary: short };
  }

  if (loading) return <div className="p-4">Loading transactions…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="shrink-0 text-2xl leading-tight font-semibold text-foreground">
        Transactions
      </h1>

      <div className="flex flex-col gap-2">
        <input
          className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted sm:max-w-md"
          placeholder="Search by userOpHash or transactionHash…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <select
            className="h-9 w-[100px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
            value={chainId}
            onChange={e => setChainId(Number(e.target.value))}
          >
            {Object.entries(CHAIN_NAMES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="h-9 w-[140px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
            value={sortMode}
            onChange={e => setSortMode(e.target.value as any)}
          >
            <option disabled>Primary sort</option>
            <option value="nameAsc">Name (A → Z)</option>
            <option value="nameDesc">Name (Z → A)</option>
            <option value="coinSymbolAsc">Symbol (A → Z)</option>
            <option value="coinSymbolDesc">Symbol (Z → A)</option>
            <option value="addressAsc">Address (A → Z)</option>
            <option value="addressDesc">Address (Z → A)</option>
            <option value="chainIdAsc">Chain ID (Low → High)</option>
            <option value="chainIdDesc">Chain ID (High → Low)</option>
            <option value="createdDesc">Newest first</option>
            <option value="createdAsc">Oldest first</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={openTransferModal}
          >
            &nbsp;Send coins&nbsp;
          </button>&nbsp;
          <button
            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={openContractTransaction}
          >
            &nbsp;Use a smart contract&nbsp;
          </button>
          <button
            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            &nbsp;{isRefreshing ? "Refreshing…" : "Refresh"}&nbsp;
          </button>
        </div>
        {refreshError && (
          <div className="text-xs text-red-600 border border-red-200 rounded-md p-2">
            Refresh error: {refreshError}
          </div>
        )}
      </div>

      {txns.length === 0 ? (
        <div className="text-sm text-muted">
          No transactions
        </div>
      ) : (
        <ul className="space-y-2">
          {txns.map(item => {
            // Look up associated folio and coin
            const folio = folios.find(f => f.id === item.folioId);
            const coin = coins.find(c => c.id === item.coinId);
            const addressMap =
              address.find(a => a.id === item.addressId) ??
              contacts.find(c => c.id === item.addressId) ??
              contracts.find(c => c.id === item.addressId);
            const domain = domains.find(d => d.chainId === item.chainId);

            const folioName = folio?.name ?? item.folioId;
            const coinSymbol = item.tokenSymbol ?? coin?.symbol ?? "—";
            const chainName =
              folio && CHAIN_NAMES[folio.chainId]
                ? CHAIN_NAMES[folio.chainId]
                : CHAIN_NAMES[item.chainId]
                  ? CHAIN_NAMES[item.chainId]
                  : `Chain ${item.chainId}`;

            const isIncoming = item.direction === "incoming";

            const TRANSFER_FN_NAMES = new Set(["transfer", "transferFrom", "safeTransferFrom", "safeBatchTransferFrom", "approve"]);
            const isTransferOrApproval = !!item.functionName && TRANSFER_FN_NAMES.has(item.functionName);
            const senderDisplay = (!isIncoming && isTransferOrApproval && item.fromAddress)
              ? getAddressDisplay(item.fromAddress, undefined)
              : null;
            const receiverDisplay = (!isIncoming && isTransferOrApproval && item.receiverAddress)
              ? getAddressDisplay(item.receiverAddress, undefined)
              : null;

            // Directional address display
            const fromDisplay = getAddressDisplay(item.fromAddress, item.ensFromName);
            const toDisplay = item.toAddress
              ? getAddressDisplay(item.toAddress, item.ensToName)
              : { primary: addressMap?.name ?? "" };

            const alreadyContact = isIncoming && item.fromAddress
              ? isSenderAlreadyContact(item.fromAddress, item.chainId, item.ensFromName)
              : true;

            return (
              <li key={item.id} className="w-full">
                <div className="w-full rounded-lg border border-border bg-card px-4 py-3">
                  <div className="grid gap-3 sm:gap-x-6 sm:gap-y-2 sm:grid-cols-[160px_90px_minmax(0,1fr)_110px] sm:items-start">
                    {/* Col 1: Direction + folio */}
                    <div className="min-w-0 font-medium">
                      {isIncoming ? (
                        <span title="Incoming">← {folioName}</span>
                      ) : (
                        <span title="Outgoing">→ {folioName}</span>
                      )}
                    </div>

                    {/* Col 2: Coin + Chain */}
                    <div className="min-w-0 text-xs text-muted-foreground sm:pt-1">
                      <div>{coinSymbol}</div>
                      {item.amount && <div className="font-mono">{item.amount}</div>}
                      <div>{chainName}</div>
                    </div>

                    {/* Col 3: From/To + tx hashes */}
                    <div className="min-w-0">
                      {isIncoming ? (
                        <div className="text-xs text-muted-foreground">
                          From:{" "}
                          <span title={item.fromAddress} className="font-mono">
                            {fromDisplay.primary}
                          </span>
                          {fromDisplay.secondary && (
                            <span className="ml-1 text-muted">({fromDisplay.secondary})</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Tx Recipient:{" "}
                            <span title={item.toAddress} className="font-mono">
                              {toDisplay.primary}
                            </span>
                            {toDisplay.secondary && (
                              <span className="ml-1 text-muted">({toDisplay.secondary})</span>
                            )}
                          </div>
                          {senderDisplay && (
                            <div className="text-xs text-muted-foreground">
                              Sender:{" "}
                              <span title={item.fromAddress} className="font-mono">
                                {senderDisplay.primary}
                              </span>
                              {senderDisplay.secondary && (
                                <span className="ml-1 text-muted">({senderDisplay.secondary})</span>
                              )}
                            </div>
                          )}
                          {receiverDisplay && (
                            <div className="text-xs text-muted-foreground">
                              Receiver:{" "}
                              <span title={item.receiverAddress} className="font-mono">
                                {receiverDisplay.primary}
                              </span>
                              {receiverDisplay.secondary && (
                                <span className="ml-1 text-muted">({receiverDisplay.secondary})</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      <div
                        className="mt-0.5 text-xs text-muted-foreground font-mono break-words sm:truncate sm:break-normal"
                        title={item.transactionHash ?? ""}
                      >
                        Tx: {item.transactionHash}
                      </div>
                      {!isIncoming && (
                        <div
                          className="mt-0.5 text-xs text-muted-foreground font-mono break-words sm:truncate sm:break-normal"
                          title={item.userOpHash ?? ""}
                        >
                          UserOp: {item.userOpHash}
                        </div>
                      )}
                    </div>

                    {/* Col 4: Actions */}
                    <div className="justify-self-start sm:justify-self-end flex flex-col gap-1">
                      <button
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={!item.transactionHash || !domain?.transactionUrl}
                        onClick={() => {
                          window.open(`${domain!.transactionUrl}${item.transactionHash}`, "_blank", "noopener,noreferrer");
                        }}
                      >
                        View on Explorer
                      </button>
                      {isIncoming && !alreadyContact && item.fromAddress && (
                        <button
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                          onClick={() => handleAddContact(item.chainId, item.fromAddress!, item.ensFromName)}
                        >
                          Add Contact
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Modal */}
      {isModalOpen ? createPortal(
        <div
          className="bg-background/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div className="bg-background"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 448,
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            }}
          >
            <h2 className="mb-3 text-base font-semibold">
              {cardTitle}
            </h2>
            <h3 className="mb-4 text-xs font-semibold">
              {cardDescription}
            </h3>
            <div className="space-y-1">
              <div className="min-w-0">
                <label className="text-xs font-medium">Folio</label>
              </div>
              <select
                className="w-full rounded-md border px-2 py-1 text-sm"
                value={selectFolio?.id ?? ""}
                onChange={(e) => setSelectFolio(folios.find((f) => String(f.id) === e.target.value) ?? null)}
              >
                <option value="">{fLoading ? "Loading..." : "Select folio"}</option>
                {folios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.address})
                  </option>
                ))}
              </select>
              {fError && (
                <p className="text-xs text-red-600 mt-1">Error: {fError}</p>
              )}
            </div>
            {/* Contract selector */}
            {!transferOrTransaction && (<div className="space-y-1">
              <div className="min-w-0">
                <label className="text-xs font-medium">Contract</label>
              </div>
              <select
                className="h-9 w-[110px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                value={selectContract?.id ?? ""}
                onChange={(e) => setSelectContract(contracts.find((c) => String(c.id) === e.target.value) ?? null)}
              >
                <option value="">{crLoading ? "Loading..." : "Select contract"}</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.address})
                  </option>
                ))}
              </select>
              {crError && (
                <p className="text-xs text-red-600 mt-1">Error: {crError}</p>
              )}
            </div>)}
            {transferOrTransaction && (<div className="space-y-1">
              <div className="min-w-0">
                <label className="text-xs font-medium">Coin</label>
              </div>
              <select
                className="h-9 w-[110px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                value={selectCoin?.id ?? ""}
                onChange={(e) => setSelectCoin(coins.find((c) => String(c.id) === e.target.value) ?? null)}
              >
                <option value="">{cLoading ? "Loading..." : "Select coin"}</option>
                {coins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.symbol})
                  </option>
                ))}
              </select>
              {cError && (
                <p className="text-xs text-red-600 mt-1">Error: {cError}</p>
              )}
            </div>)}

            {/* Selected coin balance*/}
            {transferOrTransaction && selectCoin && (
              <div className="text-xs text-muted space-y-1">
                <div>
                  <span className="font-medium">Balance:</span> {coinBalance} {selectCoin.symbol}
                </div>
              </div>
            )}

            {/* Function selector */}
            {hasAbi ? (
              <div className="space-y-1">
                <div className="min-w-0">
                  <label className="text-xs font-medium">Function</label>
                </div>
                <select
                  className="h-9 w-[110px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                  value={selectedFnName}
                  onChange={(e) => {
                    setSelectedFnName(e.target.value);
                    setArgValues({});
                    setReadResult(null);
                    setError(null);
                  }}
                >
                  <optgroup label="Write (nonpayable/payable)">
                    {writeFunctions.map((fn) => (
                      <option key={`w-${fn.name}`} value={fn.name}>
                        {fn.name}({fn.inputs.map((i) => i.type).join(",")})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Read (view/pure)">
                    {readFunctions.map((fn) => (
                      <option key={`r-${fn.name}`} value={fn.name}>
                        {fn.name}({fn.inputs.map((i) => i.type).join(",")})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            ) : (
              selectContract && (
                <p className="text-xs text-red-600">
                  No valid ABI found for this contract. Ensure you stored the ABI as
                  either an array or an object with an <code>abi</code> field.
                </p>
              )
            )}

            {!transferOrTransaction && isPayable && (
              <div className="space-y-1">
                <div className="min-w-0">
                  <label className="text-xs font-medium">
                    Payable value <span className="text-muted">(ETH)</span>
                  </label>
                </div>
                <div className="min-w-0">
                  <input
                    className="h-9 w-[110px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                    value={payableValue}
                    onChange={(e) => setPayableValue(e.target.value)}
                    placeholder="0.0"
                  />
                </div>
              </div>
            )}

            {/* Dynamic inputs */}
            {selectedFn?.inputs.map((input, index) => {
              const key = getInputName(input, index);

              // Special UI for address inputs
              if (input.type === "address") {
                // ensure it exists (one-time)
                if (!addressFieldState[key]) ensureAddressField(key);

                const st = addressFieldState[key] ?? { mode: "manual", manual: "", selectedIndex: null };

                const list =
                  st.mode === "address" ? address :
                    st.mode === "coin" ? coins :
                      st.mode === "folio" ? folios :
                        [];

                const ensState = ensResolutionState[key];

                return (
                  <div key={key} className="space-y-1">
                    <div className="min-w-0">
                      <label className="text-xs font-medium">
                        {key} <span className="text-muted">(address)</span>
                      </label>
                    </div>

                    {/* selector: manual/address/coin/folio */}
                    <div className="min-w-0">
                      <select
                        className="h-9 w-[110px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                        value={st.mode}
                        onChange={(e) => {
                          const mode = e.target.value as AddressMode;
                          setAddressFieldState((prev) => ({
                            ...prev,
                            [key]: { mode, manual: "", selectedIndex: null },
                          }));
                          setEnsResolutionState(prev => {
                            const next = { ...prev };
                            delete next[key];
                            return next;
                          });
                        }}
                      >
                        <option value="manual">Manual</option>
                        <option value="address">Address</option>
                        <option value="coin">Coin</option>
                        <option value="folio">Folio</option>
                      </select>
                    </div>

                    {/* second control */}
                    <div className="min-w-0">
                      {st.mode === "manual" ? (
                        <>
                          <input
                            className="h-9 w-[110px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                            value={st.manual}
                            onChange={(e) => handleManualAddressChange(key, st, e.target.value)}
                            onBlur={(e) => handleManualAddressBlur(key, e.target.value)}
                            placeholder="0x… or name.eth"
                          />
                          {ensState?.status === "resolving" && (
                            <div className="mt-0.5 text-xs text-muted-foreground">Resolving ENS…</div>
                          )}
                          {ensState?.status === "resolved" && (
                            <div className="mt-0.5 text-xs text-green-600">
                              Resolved: {ensState.resolvedAddress}
                            </div>
                          )}
                          {ensState?.status === "not-found" && (
                            <div className="mt-0.5 text-xs text-red-600">ENS name not found</div>
                          )}
                        </>
                      ) : (
                        <select
                          className="h-9 w-[180px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                          value={st.selectedIndex ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAddressFieldState((prev) => ({
                              ...prev,
                              [key]: { ...st, selectedIndex: v === "" ? null : Number(v) },
                            }));
                          }}
                        >
                          <option value="">Select {st.mode}</option>
                          {list.map((item: any, i: number) => (
                            <option key={`${key}-${i}`} value={i}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                  </div>
                );
              }

              // Default UI for non-address inputs
              return (
                <div key={key} className="space-y-1">
                  <div className="min-w-0">
                    <label className="text-xs font-medium">
                      {key} <span className="text-muted">({input.type})</span>
                    </label>
                  </div>
                  <div className="min-w-0">
                    <input
                      className="h-9 w-[110px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                      value={argValues[key] ?? ""}
                      onChange={(e) => handleArgChange(key, e.target.value)}
                      placeholder={
                        input.type.endsWith("[]")
                          ? `JSON array for ${input.type}`
                          : input.type === "bool"
                            ? "true / false"
                            : ""
                      }
                    />
                  </div>
                </div>
              );
            })}

            <div className="space-y-2">
              <button
                type="button"
                className="rounded-md border px-3 py-1 text-xs"
                onClick={closeModal}
              >
                &nbsp;Cancel&nbsp;
              </button>&nbsp;
              {isReadOnly ? (<button
                type="button"
                className="rounded-md border px-3 py-1 text-xs"
                onClick={handleReadCall}
              >
                &nbsp;Query&nbsp;
              </button>
              ) : (
                <button
                  type="button"
                  disabled={submitDisabled}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  onClick={handleBuildCalldata}
                >
                  &nbsp;Submit&nbsp;
                </button>
              )}
            </div>

            {/* Read Result */}
            {readResult && (
              <div className="text-xs text-primary border border-primary rounded-md p-2">
                <pre>{readResult}</pre>
              </div>
            )}

            {/* Error */}
            {formError && (
              <div className="text-xs text-red-600 border border-red-200 rounded-md p-2">
                {formError}
              </div>
            )}
          </div>
        </div>,
        document.body
      ) : null}


    </div>
  );
}
