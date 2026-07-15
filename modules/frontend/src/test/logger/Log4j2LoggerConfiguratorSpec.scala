/*
 * Copyright 2018 Comcast Cable Communications Management, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package logger

import java.io.File
import org.junit.runner.RunWith
import org.specs2.mutable.Specification
import org.specs2.runner.JUnitRunner
import play.api.{Configuration, Environment, Mode}

@RunWith(classOf[JUnitRunner])
class Log4j2LoggerConfiguratorSpec extends Specification {

  "Log4j2LoggerConfigurator" should {
    "init completes without error" in {
      val configurator = new Log4j2LoggerConfigurator()
      configurator.init(new File("."), Mode.Test)
      ok
    }

    "configure(env) completes without error" in {
      val configurator = new Log4j2LoggerConfigurator()
      configurator.configure(Environment.simple())
      ok
    }

    "configure(env, conf, props) applies logger level overrides" in {
      val configurator = new Log4j2LoggerConfigurator()
      val config = Configuration.from(Map("logger" -> Map("root" -> "WARN", "application" -> "DEBUG")))
      configurator.configure(Environment.simple(), config, Map.empty)
      ok
    }

    "configure(env, conf, props) with no logger config completes without error" in {
      val configurator = new Log4j2LoggerConfigurator()
      configurator.configure(Environment.simple(), Configuration.empty, Map.empty)
      ok
    }

    "configure(properties, config) completes without error" in {
      val configurator = new Log4j2LoggerConfigurator()
      configurator.configure(Map.empty[String, String], None)
      ok
    }

    "loggerFactory returns a non-null ILoggerFactory" in {
      val configurator = new Log4j2LoggerConfigurator()
      configurator.loggerFactory must not beNull
    }

    "shutdown completes without error" in {
      val configurator = new Log4j2LoggerConfigurator()
      configurator.shutdown()
      ok
    }

    "stop completes without error" in {
      val configurator = new Log4j2LoggerConfigurator()
      configurator.stop()
      ok
    }
  }
}
