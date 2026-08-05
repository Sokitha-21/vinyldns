import play.sbt.PlayRunHook
import java.io.{OutputStream, PrintStream}

/** PlayRunHook that suppresses known noisy-but-harmless Play dev-mode warnings
  * by installing a filtered PrintStream on System.out before the server starts.
  * The original stream is restored when the server stops.
  */
object SuppressWarningsHook {

  private val SUPPRESSED = Seq(
    "No play.logger.configurator found"
  )

  def apply(): PlayRunHook = new PlayRunHook {
    @volatile private var original: PrintStream = _

    override def beforeStarted(): Unit = {
      original = System.out
      System.setOut(new PrintStream(new OutputStream {
        private val buf = new java.io.ByteArrayOutputStream(256)

        override def write(b: Int): Unit = {
          buf.write(b)
          if (b == '\n') flush()
        }

        override def write(b: Array[Byte], off: Int, len: Int): Unit = {
          buf.write(b, off, len)
          // Flush on any newline in the chunk
          if ((off until off + len).exists(b(_) == '\n'.toByte)) flush()
        }

        override def flush(): Unit = {
          val line = buf.toString("UTF-8")
          buf.reset()
          if (line.nonEmpty && !SUPPRESSED.exists(line.contains)) {
            original.print(line)
            original.flush()
          }
        }
      }))
    }

    override def afterStopped(): Unit = {
      System.out.flush()
      if (original != null) System.setOut(original)
    }
  }
}
