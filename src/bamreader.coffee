###
# BAMReader by Shin Suzuki(@shinout)
####
BGZF_ESTIMATED_LEN = 65536
BGZF_HEADER = new Buffer("1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00".split(" ").join(""), "hex")
fs = require("fs")
createReadStream = fs.createReadStream
childProcess = require("child_process")
require("termcolor").define
inflateRawSync = require("zlib-raw-sync").inflateRawSync

SEQ_ARR = "=ACMGRSVTWYHKDBN".split("")
CIGAR_ARR = "MIDNSHP=X".split("")
FLAGS = [
  "multiple"
  "allmatches"
  "unmapped"
  "next_unmapped"
  "reversed"
  "next_reversed"
  "first"
  "last"
  "secondary"
  "lowquality"
  "duplicate"
  "supplementary"
]

class BAMReader
  constructor: (@bamfile, @options={})->
    @bamfile.pause() if @bamfile.readable

    childProcess.exec "which samtools", (e, stdout,stderr)=>
      @beginSamtools(@options.sam) if @options.samtools
      if not @options.sam and (e or stderr or @options.native) then @begin() else @beginSamtools(@options.sam)

  @create: (bamfile, options={})->
    return new BAMReader(bamfile, options)

  on: (name, fn)->
    switch name
      when "sam" then @onSam = fn
      when "bam" then @onBam = fn
      when "end" then @onEnd = fn
      when "header" then @onHeader = fn

  beginSamtools: (isSam)->
    samtoolsCmd = @options.samtools or "samtools"
    onBam = @onBam
    onSam = @onSam
    onEnd = @onEnd
    onHeader = @onHeader
    options = @options


    if isSam
      samtools = null
      lines = require("linestream").create(@bamfile)
    else
      file = if @bamfile.readable then "-" else @bamfile
      samtools = childProcess.spawn samtoolsCmd, ["view", "-h", file]
      lines = require("linestream").create(samtools.stdout)

    readingHeader = true
    headerLines = []

    lines.on "end", onEnd if onEnd

    lines.on "data", (samline)->
      if readingHeader
        if samline.charAt(0) is '@'
          headerLines.push samline
          return
        else
          readingHeader = false
          onHeader headerLines.join("\n") if onHeader
          headerLines = null

      onSam samline if onSam
      if onBam
        sam = samline.split("\t")
        # output
        bamline =
          qname   : sam[0]
          flag    : Number sam[1]
          rname   : sam[2]
          pos     : Number sam[3]
          mapq    : Number sam[4]
          cigar   : sam[5]
          rnext   : sam[6]
          pnext   : Number(sam[7])+1
          tlen    : Number sam[8]
          seq     : sam[9]
          qual    : sam[10]
          tags    : {}
          start   : Number(sam[3])-1
          flags   : {}
          tagstr  : sam.slice(11).join("\t")
        bamline.flags[flagname] = !!(bamline.flag & (0x01 << i)) for flagname,i in FLAGS
        for tag in sam.slice(11)
          val = tag.split(":")
          tag = val[0]
          type = val[1]
          switch type
            when "i","f" then value = Number val[2]
            when "B"
              value = val[2].split(",")
              subtype = value[0]
              if subtype in ["c","C","s","S","i","I","f"]
                value = (Number v for v in value)
                value[0] = subtype
            else
              value = val[2]
          bamline.tags[tag] = type: type, value: value
        onBam bamline

    if @bamfile.readable
      @bamfile.pipe samtools.stdin if samtools
      @bamfile.resume()

  begin: ()->
    onBam = @onBam
    onSam = @onSam
    onEnd = @onEnd
    onHeader = @onHeader
    options = @options

    if @bamfile.readable
      rstream = @bamfile
      rstream.resume()
    else
      rstream = createReadStream(@bamfile, highWaterMark: 1024 * 1024 - 1)

    refs = {}
    bambuf4h = new Buffer(0)
    readingHeader = true
    remainedBuffer = new Buffer(0)

    # read deflated buffers
    _read = (newBuffer)->
      buf = Buffer.concat [remainedBuffer, newBuffer], remainedBuffer.length + newBuffer.length
      # split deflated buffer
      [defBufs, remainedBuffer] = BAMReader.splitDeflatedBuffer(buf)

      for defBuf in defBufs
        bambuf = inflateRawSync defBuf
        # read header
        if readingHeader
          bambuf4h = Buffer.concat [bambuf4h, bambuf]
          try
            {refs, headerStr, bambuf} = BAMReader.readHeaderFromInflatedBuffer bambuf4h, true
            readingHeader = false
            onHeader headerStr if onHeader
            continue if bambuf.length is 0
          catch e
            continue
        # read alignments
        bams = BAMReader.readAlignmentsFromInflatedBuffer bambuf, refs
        onBam bamline for bamline in bams if onBam
        onSam(BAMReader.bamToSam(bamline)) for bamline in bams if onSam

    rstream.on "data", _read

    rstream.on "end", ()->
      # read remained buffer
      _read(remainedBuffer)
      onEnd() if onEnd

  # read header from a bamfile
  @readHeader = (bamfile)->
    infBuf = new Buffer(0)
    offset = 0
    fd = fs.openSync bamfile, "r"

    loop
      [bufToInflate, next] = BAMReader.getDeflatedBuffer(fd, offset)
      offset = next

      _infBuf = inflateRawSync bufToInflate
      infBuf = Buffer.concat [infBuf, _infBuf]

      try
        headerInfo = BAMReader.readHeaderFromInflatedBuffer(infBuf)
        headerInfo.offset = offset
        headerInfo.fd = fd
        break
      catch e
    return headerInfo

  @splitBody = (bamfile, num, headerInfo)->
    headerInfo = headerInfo or BAMReader.readHeader(bamfile)
    size = (fs.statSync bamfile).size
    offset = headerInfo.offset
    fd = headerInfo.fd or fs.openSync(bamfile, "r")
    interval = Math.floor((size-offset)/num)
    positions = []

    buflen = Math.min(BGZF_ESTIMATED_LEN, interval)

    for k in [0...num]
      # finding accurate position of BGZF
      start = interval * k + offset-1
      buf = new Buffer(buflen)
      fs.readSync fd, buf, 0, buflen, start
      cursor = -1
      match = false
      until match or cursor + 16 > buf.length
        cursor++
        headerCandidate = buf.slice(cursor, cursor+16)
        match = true
        for b,i in BGZF_HEADER
          if b isnt headerCandidate[i]
            match = false
            break
      positions.push(start + cursor) if match
    fs.closeSync(fd)
    return positions: positions, size: size, header: headerInfo

  @getDeflatedBuffer = (fd, offset)->
    defBuf = new Buffer(0)
    k = 0
    loop
      _defBuf = new Buffer(BGZF_ESTIMATED_LEN)
      fs.readSync fd, _defBuf, 0, BGZF_ESTIMATED_LEN, offset + k * BGZF_ESTIMATED_LEN
      for i in [0...16]
        throw new Error("not BGZF (offset=#{offset}, i=#{i})") if _defBuf[i] isnt BGZF_HEADER[i]
      defBuf = Buffer.concat [defBuf, _defBuf]
      delta = defBuf.readUInt16LE(16) + 1
      break if defBuf.length >= delta
      k++

    bufToInflate = defBuf.slice(18, delta-8)
    return [bufToInflate, offset + delta]

  @splitDeflatedBuffer = (defBuf)->
    defBufs = []
    loop
      return [defBufs,defBuf] if defBuf.length <= 26
      cdataLen = defBuf.readUInt16LE(16)- 25
      return [defBufs,defBuf] if defBuf.length < cdataLen + 26
      # unzip
      defBufs.push defBuf.slice(18, cdataLen + 18)
      defBuf = defBuf.slice(26+cdataLen)

  # reading bam header
  @readHeaderFromInflatedBuffer = (bambuf, ifReturnsBamBuf)->
    refs = {}
    headerLen = bambuf.readInt32LE(4)
    throw new Error("header len") if bambuf.length < headerLen + 16
    headerStr = bambuf.slice(8,headerLen+8).toString("ascii")
    cursor = headerLen + 8
    nRef = bambuf.readInt32LE cursor
    cursor+=4

    for i in [0...nRef]
      nameLen = bambuf.readInt32LE cursor
      cursor+=4
      name = bambuf.slice(cursor, cursor+nameLen-1).toString("ascii")
      cursor+=nameLen
      refLen = bambuf.readInt32LE cursor
      cursor+=4
      refs[i] = name: name, len: refLen

    ret = refs: refs, headerStr: headerStr
    ret.bambuf = bambuf.slice(cursor) if ifReturnsBamBuf
    return ret

  # reading bam alignment data
  @readAlignmentsFromInflatedBuffer = (buf, refs, readFirst)->
    bams = []
    while buf.length
      cursor = 0
      blockSize = buf.readInt32LE cursor

      break if buf.length < blockSize
      cursor+=4

      refId = buf.readInt32LE cursor
      rname = if refId is -1 then "*" else refs[refId].name
      cursor+=4

      pos = buf.readInt32LE cursor
      cursor+=4

      readNameLen = buf.readUInt8 cursor
      cursor++

      mapq = buf.readUInt8 cursor
      cursor++

      bin = buf.readUInt16LE cursor
      cursor+=2

      cigarLen = buf.readUInt16LE cursor
      cursor+=2

      flag = buf.readUInt16LE cursor
      flags = {}
      flags[flagname] = !!(flag & (0x01 << i)) for flagname,i in FLAGS
      cursor+=2

      seqLen = buf.readInt32LE cursor
      cursor+=4

      nextRefId = buf.readInt32LE cursor
      rnext = if nextRefId is -1 then "*" else refs[nextRefId].name
      cursor+=4

      nextPos = buf.readInt32LE cursor
      cursor+=4

      tLen = buf.readInt32LE cursor
      cursor+=4

      readName = buf.slice(cursor, cursor+readNameLen-1).toString("ascii")
      cursor+=readNameLen

      cigar = []
      for i in [0...cigarLen]
        num = buf.readUInt32LE(cursor, cursor+4)
        char = CIGAR_ARR[num & 0x0f]
        num = num>>4
        cigar.push num + char
        cursor+=4
      cigar = cigar.join("")

      seqLenByte = Math.floor((seqLen+1)/2)

      seqBits = buf.slice(cursor, cursor+seqLenByte)
      seq = []
      for byte in seqBits
        seq.push SEQ_ARR[byte >>4]
        second = SEQ_ARR[byte & 0x0F]
        seq.push second if second isnt "="
      seq = seq.join("")
      cursor+=seqLenByte

      #phredQuals = buf.slice(cursor, cursor+seqLen).toString("hex")
      qual = (String.fromCharCode(buf[cursor+i]+33) for i in [0...seqLen]).join("")
      cursor+=seqLen

      tags = {}
      while true
        break if cursor-4 >= blockSize
        tag = buf.slice(cursor, cursor+2).toString("ascii")
        cursor+=2
        valtype = String.fromCharCode buf[cursor]
        cursor++

        switch valtype
          when "A"
            tags[tag] = type: valtype, value: String.fromCharCode buf[cursor]
            cursor++
          when "c"
            tags[tag] = type: "i", value: buf.readInt8 cursor
            cursor++
          when "C"
            tags[tag] = type: "i", value: buf.readUInt8 cursor
            cursor++
          when "s"
            tags[tag] = type: "i", value: buf.readInt16LE cursor
            cursor+=2
          when "S"
            tags[tag] = type: "i", value: buf.readUInt16LE cursor
            cursor+=2
          when "i"
            tags[tag] = type: "i", value: buf.readInt32LE cursor
            cursor+=4
          when "I"
            tags[tag] = type: "i", value: buf.readUInt32LE cursor
            cursor+=4
          when "f"
            tags[tag] = type: valtype, value: buf.readFloatLE cursor
            cursor+=4
          when "B"
            subtype = String.fromCharCode buf[cursor]
            cursor++
            arrayLen = buf.readInt32LE cursor
            cursor+=4
            switch subtype
              when "c"
                tags[tag] = type: valtype, value: (buf.readInt8 cursor+i for i in [0...arrayLen])
                cursor+=arrayLen
              when "C"
                tags[tag] = type: valtype, value: (buf.readUInt8 cursor+i for i in [0...arrayLen])
                cursor+=arrayLen
              when "s"
                tags[tag] = type: valtype, value: (buf.readInt16LE cursor+i*2 for i in [0...arrayLen])
                cursor+=arrayLen*2
              when "S"
                tags[tag] = type: valtype, value: (buf.readUInt16LE cursor+i*2 for i in [0...arrayLen])
                cursor+=arrayLen*2
              when "i"
                tags[tag] = type: valtype, value: (buf.readInt32LE cursor+i*4 for i in [0...arrayLen])
                cursor+=arrayLen*4
              when "I"
                tags[tag] = type: valtype, value: (buf.readUInt32LE cursor+i*4 for i in [0...arrayLen])
                cursor+=arrayLen*4
              when "f"
                tags[tag] = type: valtype, value: (buf.readFloatLE cursor+i*4 for i in [0...arrayLen])
                cursor+=arrayLen*4
            value.unshift subtype

          when "Z"
            zLen = 0
            zLen++ while buf[cursor+zLen] isnt 0x00
            tags[tag] = type: valtype, value: buf.slice(cursor, cursor+zLen).toString("ascii")
            cursor+=zLen+1
          when "H"
            hLen = 0
            hLen++ while buf[cursor+hLen] isnt 0x00
            tags[tag] = type: valtype, value: buf.slice(cursor, cursor+hLen).toString("hex")
            cursor+=hLen+1

      buf = buf.slice cursor

      # output
      bams.push
        qname   : readName
        flag    : flag
        rname   : rname
        pos     : pos+1
        mapq    : mapq
        cigar   : cigar
        rnext   : rnext
        pnext   : nextPos+1
        tlen    : tLen
        seq     : seq
        qual    : qual
        tags    : tags
        start   : pos
        flags   : flags
        tagstr  : ([name, tag.type, if Array.isArray tag.value then tag.value.join(",") else tag.value].join(":") for name,tag of tags).join("\t")
      return bams[0] if readFirst
    return bams

  @bamToSam = (bamline)->
    [
      bamline.qname
      bamline.flag
      bamline.rname
      bamline.pos
      bamline.mapq
      bamline.cigar || "*"
      if bamline.rnext is bamline.rname and bamline.rname isnt "*" then "=" else bamline.rnext
      bamline.pnext
      bamline.tlen
      bamline.seq
      bamline.qual
      bamline.tagstr
    ].join("\t")

module.exports = BAMReader
