export ETH_RPC_URL=${ETH_RPC_URL:-https://eth.drpc.org}
C=cast; A=0x85d456B2DfF1fd8245387C0BfB64Dfb700e98Ef3; U=0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1
e=$1; B=$2
eff=$($C call --block $B $U "getUlnConfig(address,uint32)((uint64,uint8,uint8,uint8,address[],address[]))" $A $e 2>&1)
app=$($C call --block $B $U "getAppUlnConfig(address,uint32)((uint64,uint8,uint8,uint8,address[],address[]))" $A $e 2>&1)
lib=$($C call --block $B 0x1a44076050125825900e736c501f859c50fE728c "getSendLibrary(address,uint32)(address)" $A $e 2>&1 | tr '\n' ' ')
echo "$e | eff=$eff | app=$app | lib=$lib"
