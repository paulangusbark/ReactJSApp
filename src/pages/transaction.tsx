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
import { useTx } from "@/lib/submitTransaction";
import { Abi, encodeFunctionData, createPublicClient, http } from "viem";
import { parseAbiArg } from "@/lib/parseAbiArgs";
import { AbiFunctionFragment, getFunctions, getInputName, extractAbi, erc20Abi, erc721Abi, erc1155Abi, nativeAbi } from "@/lib/abiTypes";
import { TxStatus } from "@/lib/submitTransaction";
import { createPortal } from "react-dom";

export function Transactions() {

  type AddressMode = "manual" | "address" | "coin" | "folio";

  type AddressFieldState = {
    mode: AddressMode;
    // when mode === "manual"
    manual: string;
    // when mode !== "manual"
    selectedIndex: number | null; // index into the relevant array
  };

  const [addressFieldState, setAddressFieldState] = React.useState<Record<string, AddressFieldState>>({});

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
  //const [selectWallet, setSelectWallet] = React.useState<number>(-1);

  const [selectedFnName, setSelectedFnName] = React.useState<string>("");
  const [argValues, setArgValues] = React.useState<Record<string, string>>({});

  //const [calldata, setCalldata] = React.useState<`0x${string}` | null>(null);
  //const [selector, setSelector] = React.useState<`0x${string}` | null>(null);

  const [readResult, setReadResult] = React.useState<string | null>(null);
  const [formError, setError] = React.useState<string | null>(null);
  const [isReading, setIsReading] = React.useState(false);


  const CHAIN_NAMES: Record<number, string> = {
    1: "Ethereum",
    11155111: "Sepolia",
    31337: "Local",
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

  function resetForm() {
    setSelectCoin(null);
    setSelectContact(null);
    setSelectContract(null);
    setSelectFolio(null);
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

  function getResolvedAddress(key: string): string {
    const st = addressFieldState[key];

    if (!st) return "";

    if (st.mode === "manual") return (st.manual ?? "").trim();

    const idx = st.selectedIndex;
    if (idx == null) return "";

    if (st.mode === "address") {
      const addrRow = address[idx];
      if (!addrRow) return "";

      if (addrRow.isContact) {
        const contact = contacts.find(c => c.id === addrRow.id);
        if (!contact?.wallets?.length) return "";

        const w = contact.wallets.find(w => w.chainId === selectDomain?.chainId);
        return (w?.address ?? "").trim();
      } else {
        const contract = contracts.find(c => c.id === addrRow.id);
        return (contract?.address ?? "").trim();
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

  async function handleSubmit() {
    //e.preventDefault();
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

    const payload: any = {
      userOpHash: recStatus?.userOpHash,
      transactionHash: recStatus?.hash,
      chainId: selectFolio?.chainId,
      addressId: addressId,
      coinId: selectCoin?.id,
      folioId: selectFolio?.id,
      walletId: selectWallet,
    };



    await addTxn({ ...payload });

    closeModal();
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

  const writeFunctions = React.useMemo(
    () =>
      functions.filter(
        (f) => f.stateMutability === "nonpayable" || f.stateMutability === "payable"
      ),
    [functions]
  );

  const readFunctions = React.useMemo(
    () =>
      functions.filter(
        (f) => f.stateMutability === "view" || f.stateMutability === "pure"
      ),
    [functions]
  );

  React.useEffect(() => {
    if (!selectDomain && domains.length) setSelectDomain(domains[0]);
  }, [selectDomain, domains]);

  React.useEffect(() => {
    // Whenever contract changes, reset function selection
    setSelectedFnName("");
    setArgValues({});
    //setSelector(null);
    //setCalldata(null);
    setReadResult(null);
    setError(null);
  }, [abi]);

  React.useEffect(() => {
    if (!selectedFnName && functions.length > 0) {
      // Prefer a write function first, otherwise any function.
      if (writeFunctions.length > 0) {
        setSelectedFnName(writeFunctions[0].name);
      } else {
        setSelectedFnName(functions[0].name);
      }
    }
  }, [selectedFnName, functions, writeFunctions]);

  const selectedFn: AbiFunctionFragment | undefined = React.useMemo(
    () => functions.find((f) => f.name === selectedFnName),
    [functions, selectedFnName]
  );

  function handleArgChange(paramKey: string, value: string) {
    setArgValues((prev) => ({ ...prev, [paramKey]: value }));
  }

  function buildArgs() {
    if (!selectedFn) return [];

    return selectedFn.inputs.map((input, index) => {
      const key = getInputName(input, index);

      if (input.type === "address") {
        return getResolvedAddress(key);
      }

      const raw = argValues[key] ?? "";
      return parseAbiArg(input.type, raw);
    });
  }

  const { startFlow, status } = useTx();

  async function handleBuildCalldata() {
    //e.preventDefault();
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

    if (isReading) return;

    try {
      setIsReading(true);
      const args = buildArgs();

      const _calldata = encodeFunctionData({
        abi,
        functionName: selectedFn.name,
        args,
      });

      //const _selector = (`0x${_calldata.slice(2, 10)}`) as `0x${string}`; // first 4 bytes

      //setSelector(_selector);
      //setCalldata(_calldata as `0x${string}`);
      if (selectFolio && selectDomain && _calldata) {
        await startFlow({
          folio: selectFolio,
          encoded: _calldata,
          domain: selectDomain
        });
        setStatus(status);
        handleSubmit();
      }
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
      const args = buildArgs();

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

      setReadResult(JSON.stringify(result, null, 2));
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
            onChange={e => setChainId(e.target.value as any)}
          >
            {Object.entries(CHAIN_NAMES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
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
        </div>
      </div>

      {txns.length === 0 ? (
        <div className="text-sm text-muted">
          No transactions
        </div>
      ) : (
        <ul className="space-y-2 overflow-visible">
          {txns.map(item => {
            // Look up associated folio and coin
            const folio = folios.find(f => f.id === item.folioId);
            const coin = coins.find(c => c.id === item.coinId);
            const addressMap = address.find(a => a.id === item.addressId);

            const folioName = folio?.name ?? item.folioId;
            const coinSymbol = coin?.symbol ?? "—";
            const chainName =
              folio && CHAIN_NAMES[folio.chainId]
                ? CHAIN_NAMES[folio.chainId]
                : folio
                  ? `Chain ${folio.chainId}`
                  : "Unknown chain";

            const addressName = addressMap?.name ?? "";

            return (
              <li
                key={`${item.folioId}-${item.coinId}-${item.walletId}`}
                className="
    grid gap-x-6 gap-y-2 rounded-lg border px-4 py-3 text-sm
    grid-cols-1
    sm:grid-cols-[80px_80px_1fr_110px] sm:items-start sm:px-8
  "
              >

                <div className="min-w-0">

                  <span className="font-medium">Sender: {folioName}</span>
                </div>
                <div className="min-w-0">

                  <div className="text-xs text-muted">Coin: {coinSymbol}</div>
                </div>
                <div className="min-w-0">

                  <div className="text-xs text-muted">Chain: {chainName}</div>
                </div>
                <div className="min-w-0">

                  <div className="text-xs text-muted">Receiver: {addressName}</div>
                </div>
                <div className="min-w-0">

                  <div className="text-xs text-muted">Transaction: {item.transactionHash}</div>
                </div>
                <div className="min-w-0">

                  <div className="text-xs text-muted">UserOphash: {item.userOpHash}</div>
                </div>

                <div className="justify-self-start sm:justify-self-end overflow-visible">
                  <button
                    className="underline" // need to replace url with domain value (transactionUrl)
                    onClick={() => {
                      if (item.transactionHash) {
                        window.open(`https://sepolia.etherscan.io/tx/${item.transactionHash}`, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    View on Etherscan
                  </button>
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
                value={selectFolio?.name}
                onChange={(e) => setSelectFolio(e.target.value as any)}
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
                value={selectContract?.name}
                onChange={(e) => setSelectContract(e.target.value as any)}
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
                value={selectCoin?.name}
                onChange={(e) => setSelectCoin(e.target.value as any)}
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
                    //setSelector(null);
                    //setCalldata(null);
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

                const resolved = getResolvedAddress(key);

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
                        <input
                          className="h-9 w-[110px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
                          value={st.manual}
                          onChange={(e) => {
                            const manual = e.target.value;
                            setAddressFieldState((prev) => ({
                              ...prev,
                              [key]: { ...st, manual },
                            }));
                          }}
                          placeholder="0x…"
                        />
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
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-background"
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
