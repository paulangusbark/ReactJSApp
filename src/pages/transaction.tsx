import * as React from "react";
import { useTxnList } from "../hooks/useTransactionList";
import { Txn } from "@/storage/transactionStore";
import { sortTransactions } from "@/lib/transactionSorting";
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
import { numberToBytes } from "viem";
import { Abi, encodeFunctionData, getFunctionSelector, createPublicClient, http } from "viem";
import { parseAbiArg } from "@/lib/parseAbiArgs";
import { AbiFunctionFragment, getFunctions, getInputName, extractAbi, erc20Abi, erc721Abi, erc1155Abi } from "@/lib/abiTypes";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { TxStatus, parseBalanceSafe } from "@/lib/submitTransaction";

export function Transactions() {
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState< "createdDesc" | "addressAsc" | "addressDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc" | "nameAsc" | "nameDesc" | "coinSymbolAsc" | "coinSymbolDesc"  >(
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
  const [selectWallet, setSelectWallet] = React.useState<number>(-1);

  const [selectedFnName, setSelectedFnName] = React.useState<string>("");
  const [argValues, setArgValues] = React.useState<Record<string, string>>({});

  const [calldata, setCalldata] = React.useState<`0x${string}` | null>(null);
  const [selector, setSelector] = React.useState<`0x${string}` | null>(null);

  const [readResult, setReadResult] = React.useState<string | null>(null);
  const [formError, setError] = React.useState<string | null>(null);
  const [isReading, setIsReading] = React.useState(false);


  // Form state for modal
  const [formAmount, setFormAmount] = React.useState<number>(0);

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
  } = useFolioList({ query, sortMode: "createdAsc", chainId });

  const {
    coins,
    loading: cLoading,
    error: cError,
    addCoin,
    deleteCoin,
    updateCoin,
  } = useCoinList({ query, sortMode: "nameAsc", standard: "", chainId });

  const {
    address,
    loading: aLoading,
    error: aError,
    addAddress,
    deleteAddress,
    updateAddress,
  } = useAddressList({ query, sortMode: "nameAsc" });

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

  function resetForm() {
    setFormAmount(0);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    var addressId;
    if (transferOrTransaction) {
        addressId = selectContact?.id;
    } else {
        addressId = selectContract?.id;
    }
    // logic to build, sign and send user op can be inserted here
    // response includes the userOphash and transactionHash

    const wallet = selectFolio?.wallet;
    const walLen = wallet?.length
    if (selectCoin && walLen && walLen > 0) {
      for (let i = 0; i < walLen; i++) {
        if (wallet[i].coin == selectCoin.id) {
          setSelectWallet(i);
        }
      } 
    } else {
      setSelectWallet(-1);
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

  
    
    await addTxn({...payload});

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
        default:
          return erc20Abi;
      }
    } else {
      return extractAbi(selectContract?.metadata);
    }
  }, [selectCoin, transferOrTransaction, selectContract]);

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
    // Whenever contract changes, reset function selection
    setSelectedFnName("");
    setArgValues({});
    setSelector(null);
    setCalldata(null);
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
      const raw = argValues[key] ?? "";
      return parseAbiArg(input.type, raw);
    });
  }

  async function handleBuildCalldata(e: React.FormEvent) {
    e.preventDefault();
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

    try {
      setIsReading(true);
      const args = buildArgs();

      const _calldata = encodeFunctionData({
        abi,
        functionName: selectedFn.name,
        args,
      });

      const _selector = (`0x${_calldata.slice(2, 10)}`) as `0x${string}`; // first 4 bytes

      setSelector(_selector);
      setCalldata(_calldata as `0x${string}`);
      if (selectFolio && selectDomain && calldata) {
        const { startFlow, status } = useTx();
        await startFlow({ 
          folio: selectFolio, 
          encoded: calldata,
          domain: selectDomain 
        });
        setStatus(status);
        handleSubmit;
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Failed to build calldata");
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

    try {
      setIsReading(true);
      const args = buildArgs();

      const client = createPublicClient({
        transport: http(selectDomain?.rpcUrl),
        // chain is optional; you can plug your Domain.chain here if you want
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Transactions</h1>

        <div className="flex flex-1 gap-2 sm:justify-end">
          <input
            className="w-full max-w-xs rounded-md border px-2 py-1 text-sm"
            placeholder="Search by userOpHash or transactionHash…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <select
            className="rounded-md border px-2 py-1 text-sm"
            value={chainId}
            onChange={e => setChainId(e.target.value as any)}
          >
          {Object.entries(CHAIN_NAMES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
          </select>
          <select
            className="rounded-md border px-2 py-1 text-sm"
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
          <button
            className="rounded-md bg-black px-3 py-1 text-xs font-medium text-white"
            onClick={openTransferModal}
          >
            Send coins
          </button>
          <button
            className="rounded-md bg-black px-3 py-1 text-xs font-medium text-white"
            onClick={openContractTransaction}
          >
            Use a smart contract
          </button>
        </div>
      </div>

      {txns.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No transactions
        </div>
      ) : (
        <ul className="space-y-2">
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
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div>
                <div className="flex items-center gap-2">

                  <span className="font-medium">Sender: {folioName}</span>
                </div>

                <div className="text-xs text-neutral-500">Coin: {coinSymbol}</div>

                <div className="text-xs text-neutral-500">Chain: {chainName}</div>

                <div className="text-xs text-neutral-500">Transaction: {item.transactionHash}</div>

                <div className="text-xs text-neutral-500">UserOphash: {item.userOpHash}</div>

                <div className="flex items-center gap-2 text-xs">
                <button
                  className="underline"
                  onClick={() => {
                    if (item.transactionHash) {
                      window.open(`https://sepolia.etherscan.io/tx/${item.transactionHash}`, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  View on Etherscan
                </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      )}

{/* Modal */}
      {isModalOpen && (
        <Card className="w-full">
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Contract selector */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Contract</label>
          <select
            className="w-full rounded-md border px-2 py-1 text-sm"
            value={selectContract?.name}
            onChange={(e) => setSelectContract(e.target.value as any)}
          >
            <option value="">{cLoading ? "Loading..." : "Select contract"}</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.address})
              </option>
            ))}
          </select>
          {crError && (
            <p className="text-xs text-red-600 mt-1">Error: {crError}</p>
          )}
        </div>

        {/* Selected contract summary */}
        {selectContract && (
          <div className="text-xs text-gray-600 space-y-1">
            <div>
              <span className="font-medium">Selected:</span> {selectContract.name}
            </div>
            <div>
              <span className="font-medium">Address:</span>{" "}
              <code>{selectContract.address}</code>
            </div>
          </div>
        )}

        {/* Function selector */}
        {hasAbi ? (
          <div className="space-y-1">
            <label className="text-xs font-medium">Function</label>
            <select
              className="w-full rounded-md border px-2 py-1 text-sm"
              value={selectedFnName}
              onChange={(e) => {
                setSelectedFnName(e.target.value);
                setArgValues({});
                setSelector(null);
                setCalldata(null);
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
        {selectedFn && (
          <form onSubmit={handleBuildCalldata} className="space-y-3 border rounded-md p-3">
            <div className="text-xs font-semibold mb-1">
              Inputs for <code>{selectedFn.name}</code>{" "}
              <span className="text-gray-500">({selectedFn.stateMutability})</span>
            </div>

            {selectedFn.inputs.length === 0 && (
              <div className="text-xs text-gray-500">No inputs</div>
            )}

            {selectedFn.inputs.map((input, index) => {
              const key = getInputName(input, index);
              return (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium">
                    {key} <span className="text-gray-500">({input.type})</span>
                  </label>
                  <input
                    className="w-full rounded-md border px-2 py-1 text-sm"
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
              );
            })}

            <div className="flex flex-wrap gap-2">
              {/* Always show: building calldata is valid for read & write */}
              <button
                type="submit"
                className="px-3 py-1 text-sm rounded-md border bg-gray-100 hover:bg-gray-200"
              >
                Submit
              </button>

              {/* Only show for read-only: can actually call via RPC */}
              {isReadOnly && (
                <button
                  type="button"
                  onClick={handleReadCall}
                  disabled={isReading}
                  className="px-3 py-1 text-sm rounded-md border bg-blue-100 hover:bg-blue-200 disabled:opacity-50"
                >
                  {isReading ? "Reading…" : "Call read-only function"}
                </button>
              )}
              <button
                  type="button"
                  className="px-3 py-1 text-sm rounded-md border bg-gray-100 hover:bg-gray-200"
                  onClick={closeModal}
                >
                  Cancel
                </button>
            </div>
          </form>
        )}

        {/* Error */}
        {formError && (
          <div className="text-xs text-red-600 border border-red-200 rounded-md p-2">
            {formError}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-3">
        {selector && (
          <div className="w-full space-y-1">
            <div className="text-xs font-semibold">Function selector (4 bytes)</div>
            <pre className="bg-gray-50 text-[10px] p-2 rounded-md break-all">
              {selector}
            </pre>
          </div>
        )}

        {calldata && (
          <div className="w-full space-y-1">
            <div className="text-xs font-semibold">
              Calldata (pass this into your userOp builder)
            </div>
            <pre className="bg-gray-50 text-[10px] p-2 rounded-md break-all">
              {calldata}
            </pre>
          </div>
        )}

        {readResult && (
          <div className="w-full space-y-1">
            <div className="text-xs font-semibold">Read result</div>
            <pre className="bg-gray-50 text-[10px] p-2 rounded-md break-all">
              {readResult}
            </pre>
          </div>
        )}
      </CardFooter>
    </Card>
      )}


    </div>
  );
}
