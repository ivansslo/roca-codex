#!/usr/bin/env bash
# shellcheck disable=SC2015,SC2016
#   SC2015 (A && B || C): pola 'kondisi && t ok || t no' disengaja di seluruh
#          berkas ini. Fungsi t tidak pernah gagal, jadi cabang || hanya
#          berjalan bila kondisinya salah — persis perilaku assertion.
#   SC2016 (kutip tunggal): string seperti '$(whoami)' memang harus literal.
#          Itu justru yang diuji: nilai env tidak boleh dieksekusi oleh shell.
# Uji regresi rocvault. Jalankan: bash tools/__tests__/rocvault.test.sh
#
# Menguji properti keamanan (tampering ditolak, plaintext tidak tertinggal),
# bukan hanya jalur bahagia. Tiga bug 'unbound variable' pernah lolos karena
# exit code 0 sementara stderr penuh error — jadi stderr ikut diperiksa.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VAULT="$ROOT/tools/rocvault"
[ -x "$VAULT" ] || { echo "Tidak ada / tidak executable: $VAULT"; exit 1; }

WORK=$(mktemp -d)
# shellcheck disable=SC2064
# Ekspansi SEKARANG memang yang diinginkan: path dibekukan saat trap dibuat.
# (Kebalikan kasusnya di rocvault, di mana kutip tunggal menunda ekspansi
# sampai variabel `local` sudah keluar scope — itulah bug yang diuji di sini.)
trap "rm -rf '$WORK'" EXIT
cd "$WORK" || { echo "Gagal masuk $WORK"; exit 1; }
P='passphrase-uji-yang-panjang'
pass=0; fail=0
t(){ if [ "$1" = ok ]; then pass=$((pass+1)); echo "  ✓ $2"; else fail=$((fail+1)); echo "  ✗ $2"; fi; }
# stderr harus bersih, bukan cuma exit 0
noerr(){ [ "$(eval "$1" 2>&1 >/dev/null | grep -c 'unbound\|error' || true)" = 0 ]; }

printf 'A=satu\nB=dua tiga\n# komentar\nC=$(whoami)\n' > .env

noerr "ROCVAULT_PASS=$P '$VAULT' lock .env"          && t ok "lock: stderr bersih"       || t no "lock: stderr kotor"
noerr "ROCVAULT_PASS=$P '$VAULT' unlock .env.vault"  && t ok "unlock: stderr bersih"     || t no "unlock: stderr kotor"
[ "$(ROCVAULT_PASS=$P "$VAULT" unlock .env.vault 2>/dev/null)" = "$(cat .env)" ] \
  && t ok "round-trip identik" || t no "round-trip rusak"

: > kosong.env
noerr "ROCVAULT_PASS=$P '$VAULT' lock kosong.env" && t ok "berkas kosong" || t no "berkas kosong gagal"

ROCVAULT_PASS='salah-passphrase-panjang' "$VAULT" unlock .env.vault >/dev/null 2>&1 \
  && t no "passphrase salah DITERIMA" || t ok "passphrase salah ditolak"

cp .env.vault t1.vault
python3 -c "d=bytearray(open('t1.vault','rb').read()); d[120]^=1; open('t1.vault','wb').write(d)" 2>/dev/null \
  || perl -e 'local $/; open F,"<t1.vault"; $d=<F>; close F; substr($d,120,1)=chr(ord(substr($d,120,1))^1); open F,">t1.vault"; print F $d'
ROCVAULT_PASS=$P "$VAULT" unlock t1.vault >/dev/null 2>&1 \
  && t no "TAMPERING ciphertext LOLOS" || t ok "tampering ciphertext ditolak"

cp .env.vault t2.vault
{ head -2 .env.vault; printf '%s\n' "00000000000000000000000000000000"; tail -n +4 .env.vault; } > t2.vault
ROCVAULT_PASS=$P "$VAULT" unlock t2.vault >/dev/null 2>&1 \
  && t no "TAMPERING IV LOLOS" || t ok "tampering IV ditolak"

got=$(ROCVAULT_PASS=$P "$VAULT" run .env.vault -- sh -c 'printf "%s|%s" "$B" "$C"' 2>/dev/null | tail -1)
[ "$got" = 'dua tiga|$(whoami)' ] \
  && t ok "run: spasi utuh, substitusi tidak dieksekusi" || t no "run salah: '$got'"

noerr "ROCVAULT_PASS=$P '$VAULT' check .env.vault" && t ok "check: stderr bersih" || t no "check kotor"

ROCVAULT_PASS=$P "$VAULT" lock .env .env.vault >/dev/null 2>&1 \
  && t no "menimpa vault tanpa peringatan" || t ok "menolak menimpa vault"

[ "$(find /dev/shm /tmp -maxdepth 1 -name 'rocvault.*' 2>/dev/null | wc -l)" = 0 ] \
  && t ok "nol plaintext tertinggal" || t no "plaintext bocor ke disk"

echo
echo "  $pass lulus, $fail gagal"
[ "$fail" -eq 0 ]
