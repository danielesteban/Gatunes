Gatunes
=======

**To install the app:**

Go to: http://gatunes.com

**To tinker with the source:**

* Update the symbolic link in "Gatunes.app/Contents/Resources/app.nw/" to the right absolute path
 
  ```rm Gatunes.app/Contents/Resources/app.nw && ln -s /Users/dani/Code/Opensource/Gatunes/app.nw Gatunes.app/Contents/Resources/app.nw```

* Install the npm modules in "app.nw/"
  
  ```cd app.nw && npm install```

* Run a sass compiler in "app.nw/css/"
  
  ```sass --watch --sourcemap=none --style=compressed --scss app.nw/css/screen.scss:app.nw/css/screen.css```

* A custom "ffmpegsumo.so" build with multiple proprietary audio/video codecs support was included for developing convenience. It was extracted from the popcorntime.io app. I'm not the owner of this file, nor I'm responsible for what it does or what you do with it.

**License:**

The MIT License (MIT)

Copyright (c) 2015 Daniel Esteban Nombela

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
