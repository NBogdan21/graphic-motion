#!/bin/sh
# compare the procedural mark (frame 5100) to the master logo, side by side
python3 -c "
from PIL import Image
a=Image.open('out/prev/f05100.png').crop((700,330,1220,760))
b=Image.open('$1').convert('RGB').crop((330,400,840,820)).resize((520,430))
c=Image.new('RGB',(1040,430),'white'); c.paste(a,(0,0)); c.paste(b,(520,0)); c.save('out/prev/cmp.png')"
