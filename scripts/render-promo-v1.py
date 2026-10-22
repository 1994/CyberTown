"""Render an honest 28s screenshot-motion review cut. Requires Pillow and ffmpeg."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
import subprocess, math, json, sys
ROOT=Path(__file__).resolve().parents[1]
POLISHED='--polished' in sys.argv
VERSION='v2' if POLISHED else 'v1'
OUT=ROOT/f'artifacts/promo-{VERSION}'; TMP=ROOT/f'.run/promo-{VERSION}'
OUT.mkdir(parents=True,exist_ok=True); TMP.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'artifacts/demo-walkthrough-20261022'
W,H,FPS=1280,720,30
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
def font(n):return ImageFont.truetype(FONT,n)
# Only verified current-game captures; no concept renders or fabricated game states.
scenes=[
 (3,'06-shop-door.png','赛博小镇','从街角的一杯奶茶开始','模拟经营 · 员工养成',None),
 (4,'04-mission.png','小镇的故事\n由你接下','打开手机，接下第一份任务','01 / 接下任务',(180,140,800,750)),
 (5,'10-service.png','第一杯\n亲手端上桌','制作 → 取餐 → 端送','02 / 亲自经营',(60,130,900,685)),
 (4,'16-auto-prep.png','招好员工\n安排好岗位','一人制作，一人端送','03 / 开店前布局',(590,190,960,740)),
 (5,'18-auto-service.png','员工接手\n你来当老板','两岗全自动，也能随时帮忙','04 / 自动营业',(55,125,920,690)),
 (4,'19-auto-report-fixed.png','忙了一班\n金币到账','本次实测：20 杯 · 零流失','05 / 经营有回报',(260,18,705,735)),
 (3,'06-shop-door.png','赛博小镇','从亲手做茶，到员工接手','DEMO · 首版预告',None),
]
if POLISHED:
  replacements={0:('04-storefront.png',None),2:('06-self-service.png',(240,110,1080,580)),3:('05-prep-final.png',(925,180,1275,650)),4:('02-service.png',(220,110,1080,580)),5:('03-report.png',(415,15,865,690)),6:('04-storefront.png',None)}
  for i,(name,crop) in replacements.items():
    d,_,title,sub,kicker,_=scenes[i]
    scenes[i]=(d,'../visual-polish-20261022/'+name,title,sub,kicker,crop)
imgs=[]
for duration,name,title,sub,kicker,crop in scenes:
 im=Image.open(SRC/name).convert('RGB')
 if crop:im=im.crop(crop)
 imgs.append(im)

def frame(si,t,dur):
 duration,name,title,sub,kicker,crop=scenes[si]; im=imgs[si]
 # Quiet warm/cool gradient consistent with the game's own palette.
 base=Image.new('RGB',(W,H)); bd=ImageDraw.Draw(base)
 for y in range(H):
  f=y/H; bd.line((0,y,W,y),fill=(int(10+4*f),int(16+8*f),int(28+9*f)))
 if si in (0,6):
  shot=ImageOps.fit(im,(W,H),centering=(.5,.46)); shot=shot.resize((int(W*1.04),int(H*1.04)))
  x=int(20+8*t/dur); shot=shot.crop((x,10,x+W,10+H));base.paste(shot)
  shade=Image.new('RGBA',(W,H));sd=ImageDraw.Draw(shade)
  for x in range(W):sd.line((x,0,x,H),fill=(4,9,20,int(225*(1-x/W)**.6)))
  base=Image.alpha_composite(base.convert('RGBA'),shade).convert('RGB')
 else:
  # Preserve entire selected crop, with a small camera push inside a bounded frame.
  box=(490,88,1228,636);bw,bh=box[2]-box[0],box[3]-box[1]
  bg=ImageOps.fit(im,(bw,bh)).filter(ImageFilter.GaussianBlur(22));bg=Image.blend(bg,Image.new('RGB',bg.size,'#07101c'),.6)
  fg=ImageOps.contain(im,(int(bw*.98),int(bh*.97)))
  scale=1+.025*t/dur;fg=fg.resize((round(fg.width*scale),round(fg.height*scale)),Image.Resampling.LANCZOS)
  bg.paste(fg,((bw-fg.width)//2,(bh-fg.height)//2))
  base.paste(bg,(box[0],box[1]));bd=ImageDraw.Draw(base);bd.rounded_rectangle(box,radius=12,outline='#2b5b66',width=2)
 layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
 alpha=min(1,t/.35);shift=round(14*(1-alpha));xx=60
 d.text((xx,47),'赛博小镇  /  CYBER TOWN',font=font(17),fill='#bdcbd1')
 d.text((1060,47),'REVIEW CUT 02' if POLISHED else 'REVIEW CUT 01',font=font(14),fill='#8dabb3')
 d.rectangle((xx,210,xx+44,214),fill='#ffdb4f')
 d.text((xx,232+shift),kicker,font=font(19),fill=(112,229,217,round(alpha*255)))
 size=76 if si in (0,6) else 49
 d.multiline_text((xx,280+shift),title,font=font(size),fill=(243,248,248,round(alpha*255)),spacing=15)
 suby=390 if si in (0,6) else 430
 d.text((xx,suby+shift),sub,font=font(21 if si in (0,6) else 18),fill=(196,208,217,round(alpha*255)))
 if si==5:
  d.text((xx,480),'+280',font=font(70),fill='#70f2bc');d.text((xx+220,521),'金币净赚',font=font(18),fill='#b5d4c8')
 if si==6:
  d.rounded_rectangle((xx,462,xx+228,510),radius=6,fill='#ffdc4d');d.text((xx+24,474),'你的第一家小店',font=font(23),fill='#14212a')
 # A discrete disclosure makes the first cut's capture method clear.
 d.text((xx,660),'真实游戏截图动态剪辑 · 开发中画面',font=font(15),fill='#9cabb8')
 elapsed=sum(x[0] for x in scenes[:si])+t
 d.rectangle((60,700,1220,702),fill='#263744');d.rectangle((60,700,60+1160*elapsed/28,702),fill='#75ddce')
 result=Image.alpha_composite(base.convert('RGBA'),layer).convert('RGB')
 fade=min(1,t/.18,(dur-t)/.18)
 if fade<1:result=Image.blend(Image.new('RGB',(W,H),'#080f1a'),result,max(0,fade))
 return result

raw=TMP/'silent.mp4'
p=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',str(raw)],stdin=subprocess.PIPE)
try:
 for i,s in enumerate(scenes):
  frame(i,s[0]/2,s[0]).save(TMP/f'scene-{i+1}.jpg',quality=92)
  for n in range(s[0]*FPS):p.stdin.write(frame(i,n/FPS,s[0]).tobytes())
  print(f'Scene {i+1}/7 rendered',flush=True)
finally:p.stdin.close()
assert p.wait()==0
final=OUT/f'cyber-town-promo-{VERSION}.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-stream_loop','-1','-i',str(ROOT/'artifacts/tea-art-audio/business.mp3'),'-map','0:v','-map','1:a','-c:v','copy','-af','loudnorm=I=-18:TP=-2:LRA=9,afade=t=in:d=0.6,afade=t=out:st=25.5:d=2.5','-c:a','aac','-b:a','192k','-t','28','-movflags','+faststart',str(final)],check=True)
frame(0,1.5,3).save(OUT/'cover.jpg',quality=95)
(OUT/'shots.json').write_text(json.dumps([{'seconds':s[0],'source':s[1],'title':s[2],'subtitle':s[3]} for s in scenes],ensure_ascii=False,indent=2)+'\n')
print(final)
