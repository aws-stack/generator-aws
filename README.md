AWS stack generator
===================

This is a yeoman generator intended to quick-start AWS stacks using ansible.

First thing you need to create is the stack configuration, this will create a yml file containing useful information about your stack such as its name, VPC network block, subnets, AWS region and so on.

AWS VPCs
========

The VPC is the most basic building block of a stack so to create a new VPC you will be also creating a stack using the command:

    yo aws

After answering the questions, the stack yml file will be create under `stacks` subdirectory and a `infrastructure` directory will also be created to hold ansible playbooks for AWS provisioning.

Now that the stack is created, you can further edit the generated files and then run ansible to actually create your VPC:

    ansible-playbook -i localhost, create-vpc.yml -e stack_name=mystack

The new vpc will be created by ansible. If in the future you decide to add more subnets to your VPC, you can edit the stacks/mystack/main.yml file adding the new subnet and execute the playbook again.

EC2 Instances
=============

The EC2 generator is used to create instances in 3 different ways:

- create a single instance
- create a group of instances which share some common properties
- create an autoscaling group

The generator will ask which AMI, key-pair, security groups, IPs, you want to use for this instance. To launch the EC2 generator, type:

    yo aws:ec2 mystack

So as you can see, this command can only be used after you created your stack. The ec2 generator then reads your mystack/main.yml and knows what subnets can be used to launch the new instance(s), what are the valid IP ranges for your project and so on.

Once you have an instance created (let's call it *helloworld*), you launch that instance using ansible:

    ansible-playbook -i localhost, ec2-launch.yml -e stack_name=mystack -e ec2_name=helloworld

Your playbook will look for the file stacks/mystack/helloworld.yml containing the parameters for your new instance(s)/autoscaling group. It will also invoke the VPC role to make sure the VPC is setup before launching the instance. 

Security groups are also created here, so if you specified a security group which wasn't defined, make sure you create its definition using
`yo aws:sg mystack`


EC2 Security Groups
===================

To create the definition for a security group, run:

	yo aws:sg mystack
	
The security-group generator only asks the name, description and rules of your security group. It will create a file called stacks/mystack/<sg-name>.yml and that file can be modified at any time to add/remove SG rules. The security group is then invoked by the ec2 role.

Author Information
------------------

Filipe Niero Felisbino <filipenf@gmail.com>
