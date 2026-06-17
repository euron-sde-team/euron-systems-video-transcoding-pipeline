# AMI build (ARM64 / aarch64, Graviton)

The workers are **`c7g.xlarge`** (Graviton3, 4 vCPU / 8 GiB, ARM64). The AMI must be **arm64** and every
baked binary must be **aarch64**. Bake everything heavy so user-data only configures and starts
(constraint #10). The AMI holds NO secrets, so one AMI serves both dev and prod.

## 1. Launch a builder
Amazon Linux 2023 **arm64** (e.g. a `c7g.xlarge` on-demand), ap-south-1. SSH or SSM in.
```
uname -m          # must print: aarch64
sudo dnf install -y gcc gcc-c++ make cmake git tar xz
```

## 2. Node.js 20 (arm64, deterministic)
NodeSource ships arm64 RPMs; this pins a current Node 20.x (>= 20.19, which supports require(ESM)):
```
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v && node -p "process.arch"     # v20.x  /  arm64
sudo npm i -g pnpm@9
```

## 3. FFmpeg + libx264 (static aarch64) -> /usr/local/bin
The johnvansickle GPL static build includes libx264 and runs on AL2023 (glibc). Install into
`/usr/local/bin` (FHS location for manually-installed binaries; the bootstrap and the worker env
expect them there):
```
cd /tmp
curl -fL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz -o ffmpeg.tar.xz
tar xJf ffmpeg.tar.xz
sudo cp ffmpeg-*-arm64-static/ffmpeg ffmpeg-*-arm64-static/ffprobe /usr/local/bin/
ffmpeg -hide_banner -encoders | grep libx264     # must list libx264
ffmpeg -hide_banner -version | head -1
```

## 4. Shaka Packager (arm64 release binary, PINNED) -> /usr/local/bin/packager
Pin a known version for reproducible AMIs (do NOT use `latest/`, it shifts under you). v3.2.0 supports
cbcs raw-key + CMAF + dual manifest, all we use. Bump deliberately (latest stable is v3.7.2).
```
sudo curl -fL -o /usr/local/bin/packager \
  https://github.com/shaka-project/shaka-packager/releases/download/v3.2.0/packager-linux-arm64
sudo chmod +x /usr/local/bin/packager
packager --version     # must report v3.2.0 (and run, confirming it is the arm64 build)
```

## 5. whisper.cpp (built aarch64) + model + STABLE symlink
The built binary is `whisper-cli` (new) or `main` (old). Symlink it to a stable path so
`WHISPER_BIN=/opt/whisper.cpp/main` always resolves regardless of upstream renames.
```
sudo git clone https://github.com/ggerganov/whisper.cpp /opt/whisper.cpp
cd /opt/whisper.cpp
sudo cmake -B build && sudo cmake --build build --config Release -j"$(nproc)"
# locate the produced CLI and symlink it to /opt/whisper.cpp/main
BIN=$(find /opt/whisper.cpp -type f \( -name whisper-cli -o -name main \) -perm -u+x | head -1)
sudo ln -sf "$BIN" /opt/whisper.cpp/main
sudo bash ./models/download-ggml-model.sh small
sudo mkdir -p /opt/models && sudo cp models/ggml-small.bin /opt/models/
```
(whisper is optional at runtime: if it ever fails the pipeline skips captions and still reaches
`ready`. The symlink just makes it work when present.)

## 6. The worker build -> /opt/euron-vod
Clone into your HOME dir, NOT `/opt`: `/opt` is root-owned, so `git clone /opt/src` as ec2-user fails
with "Permission denied" (and `sudo git clone` is wrong too, it would make `/opt/src` root-owned and
the non-sudo `pnpm install` would then fail). Private repo, so authenticate with a GitHub token (or
SSH deploy key). `prisma generate` must run BEFORE `pnpm build` (tsc compiles the generated
`src/db/types.ts`), and it wants `DATABASE_URL` to exist (no DB connection is made; a dummy is fine).
Use `sudo` only for the final copy into `/opt`:
```
cd ~
git clone https://<GITHUB_PAT>@github.com/euron-sde-team/euron-systems-video-transcoding-pipeline.git
cd euron-systems-video-transcoding-pipeline
pnpm install
DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate   # creates src/db/types.ts, no DB connection
pnpm build                                                             # tsc -> dist/
sudo mkdir -p /opt/euron-vod
sudo rsync -a dist package.json node_modules /opt/euron-vod/
node /opt/euron-vod/dist/worker/index.js --help 2>/dev/null || true   # link check (will exit fast w/o DB)
```
The worker is pure JS (no native addons), so building on the arm64 builder is safest but not
mandatory. Alternative (no git creds on the builder): build on your Mac, then
`rsync -a dist package.json node_modules ec2-user@<builder-ip>:~/euron-vod/` and on the builder
`sudo rsync -a ~/euron-vod/ /opt/euron-vod/`.

The bootstrap is NOT baked: it is supplied as per-env UserData (see DEPLOYMENT.md step 9).

## 7. Smoke test (before imaging)
```
ffmpeg -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i sine=frequency=440 \
  -t 8 -c:v libx264 -pix_fmt yuv420p -c:a aac /tmp/s.mp4
ffprobe -v error -show_streams /tmp/s.mp4 >/dev/null && echo ffprobe ok
packager --version
/opt/whisper.cpp/main -h >/dev/null 2>&1 && echo whisper ok
```

## 8. Create the image
```
aws ec2 create-image --region ap-south-1 --instance-id <BUILDER_INSTANCE_ID> \
  --name euron-vod-worker-$(date +%Y%m%d) --no-reboot \
  --description "Euron VOD ARM64 transcode worker (ffmpeg+packager+whisper+worker)" \
  --query ImageId --output text
```
Confirm the image is arm64:
```
aws ec2 describe-images --region ap-south-1 --image-ids <AMI_ID> --query 'Images[0].Architecture'  # arm64
```
Put the AMI id into `launch-template.json` (`ImageId`). The same arm64 AMI is used by both the dev
and prod launch templates.
