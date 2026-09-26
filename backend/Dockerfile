# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /app

COPY mvnw mvnw.cmd pom.xml ./
COPY .mvn .mvn

# maven-toolchains-plugin (pom.xml) needs ~/.m2/toolchains.xml naming a JDK 21
# path; that file is per-machine and deliberately not committed to the repo.
# This build stage's own base image IS JDK 21, so point the toolchain at its
# own JAVA_HOME rather than requiring one to be baked or mounted in.
RUN mkdir -p /root/.m2 && \
    printf '<?xml version="1.0" encoding="UTF-8"?>\n<toolchains>\n  <toolchain>\n    <type>jdk</type>\n    <provides>\n      <version>21</version>\n    </provides>\n    <configuration>\n      <jdkHome>%s</jdkHome>\n    </configuration>\n  </toolchain>\n</toolchains>\n' "$JAVA_HOME" > /root/.m2/toolchains.xml

# Download dependencies first (layer cache)
RUN ./mvnw dependency:go-offline -B

COPY src src

RUN ./mvnw package -DskipTests -B && \
    mv target/inclineyou-backend-*.jar target/app.jar

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=build /app/target/app.jar app.jar

USER app

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
