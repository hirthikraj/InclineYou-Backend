package com.trainx.trainx_backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class TrainxBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(TrainxBackendApplication.class, args);
	}

}
